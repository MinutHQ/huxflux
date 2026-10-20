import { execFile } from "node:child_process"
import { lstat, open, readdir, readFile, realpath, stat, writeFile, mkdir } from "node:fs/promises"
import * as path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** Thrown when a caller-supplied relative path resolves outside the worktree. */
export class PathOutsideWorktreeError extends Error {
  constructor(relPath: string) {
    super(`Path is outside the worktree: ${relPath}`)
    this.name = "PathOutsideWorktreeError"
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  // `..foo` is a legal name inside the root; only a leading `..` segment escapes.
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

/**
 * Resolve `relPath` against the worktree and refuse anything that escapes it,
 * either lexically (`../`, absolute paths) or through a symlink whose target
 * lives outside. Paths that do not exist yet are checked via their nearest
 * existing ancestor so a save into a new folder is still contained. A
 * dangling symlink is refused outright: a write would follow it to wherever
 * it points, and its target cannot be checked.
 */
export async function resolveInsideWorktree(worktreePath: string, relPath: string): Promise<string> {
  const root = path.resolve(worktreePath)
  const resolved = path.resolve(root, relPath)
  if (!isInside(root, resolved)) throw new PathOutsideWorktreeError(relPath)

  const realRoot = await realpath(root)
  let probe = resolved
  // lstat (not existsSync) so a dangling symlink counts as present and gets realpath-checked.
  while (probe !== root && !(await lstat(probe).then(() => true, () => false))) probe = path.dirname(probe)
  const realProbe = await realpath(probe).catch(() => { throw new PathOutsideWorktreeError(relPath) })
  if (!isInside(realRoot, realProbe)) throw new PathOutsideWorktreeError(relPath)
  return resolved
}

export interface DirectoryEntry {
  name: string
  path: string
  type: "file" | "directory"
  /** Matched by .gitignore (or .git/info/exclude). Shown dimmed in the browser. */
  ignored: boolean
}

async function ignoredSet(worktreePath: string, relPaths: string[]): Promise<Set<string>> {
  if (relPaths.length === 0) return new Set()
  return new Promise((resolve) => {
    const child = execFile("git", ["check-ignore", "--stdin", "-z"], { cwd: worktreePath, maxBuffer: 16 * 1024 * 1024 }, (_err, stdout) => {
      // Exit code 1 means "nothing ignored"; any other failure (not a git repo) also means no info.
      resolve(new Set(String(stdout ?? "").split("\0").filter(Boolean)))
    })
    child.stdin?.end(relPaths.join("\0") + "\0")
  })
}

/**
 * List one directory level of the worktree, including gitignored entries
 * (flagged) but never `.git` itself. Directories sort before files.
 */
export async function listDirectory(worktreePath: string, relDir = ""): Promise<DirectoryEntry[]> {
  const absDir = await resolveInsideWorktree(worktreePath, relDir)
  const dirents = await readdir(absDir, { withFileTypes: true })
  const entries = await Promise.all(dirents
    .filter((d) => d.name !== ".git")
    .map(async (d) => {
      const relPath = relDir ? `${relDir.replace(/\/+$/, "")}/${d.name}` : d.name
      let isDir = d.isDirectory()
      if (d.isSymbolicLink()) {
        // Follow the link only to decide file vs folder; reads re-check containment.
        isDir = await stat(path.join(absDir, d.name)).then((s) => s.isDirectory(), () => false)
      }
      const type: DirectoryEntry["type"] = isDir ? "directory" : "file"
      return { name: d.name, path: relPath, type }
    }))
  const ignored = await ignoredSet(worktreePath, entries.map((e) => (e.type === "directory" ? `${e.path}/` : e.path)))
  return entries
    .map((e) => ({ ...e, ignored: ignored.has(e.path) || ignored.has(`${e.path}/`) }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1))
}

/** Every tracked + untracked (non-ignored) file path, for the browser's name filter. */
export async function listAllFilePaths(worktreePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: worktreePath, maxBuffer: 64 * 1024 * 1024 },
    )
    return [...new Set(stdout.split("\0").filter(Boolean))].sort()
  } catch {
    return []
  }
}

export interface SearchMatch {
  path: string
  line: number
  preview: string
}

const MAX_PREVIEW = 240

/**
 * Parse one `--null` grep line. rg writes `path\0line:text`; git grep writes
 * `path\0line\0text` (a NUL after the line number too). Accept both.
 */
export function parseGrepLine(raw: string): SearchMatch | null {
  const nul = raw.indexOf("\0")
  if (nul < 0) return null
  const m = /^(\d+)[\0:]([\s\S]*)$/.exec(raw.slice(nul + 1))
  if (!m) return null
  return { path: raw.slice(0, nul), line: Number(m[1]), preview: (m[2] ?? "").trim().slice(0, MAX_PREVIEW) }
}

/**
 * Case-insensitive fixed-string content search across non-ignored files.
 * Uses ripgrep when on PATH (fast, respects .gitignore) and falls back to
 * `git grep` (tracked + untracked). Binary files are skipped.
 */
export async function searchFileContents(
  worktreePath: string,
  query: string,
  limit = 200,
  /** Tools to try in order. Tests pin `["git"]` to cover the fallback on machines that have rg. */
  tools: ReadonlyArray<"rg" | "git"> = ["rg", "git"],
): Promise<SearchMatch[]> {
  if (!query.trim()) return []
  // --hidden + !.git so rg sees dotfiles like git grep does; results should not depend on which tool is installed.
  const rgArgs = ["--null", "--line-number", "--no-heading", "--color", "never", "-i", "-F", "--hidden", "--glob", "!.git", "--max-count", "20", "--max-columns", "400", "-e", query, "--", "."]
  const gitArgs = ["grep", "--null", "-n", "-I", "-i", "-F", "--untracked", "-e", query]
  const run = async (cmd: string, args: string[]): Promise<string> => {
    try {
      const { stdout } = await execFileAsync(cmd, args, { cwd: worktreePath, maxBuffer: 32 * 1024 * 1024, timeout: 10_000 })
      return stdout
    } catch (err) {
      // Exit 1 = no matches for both tools. Anything with stdout is still usable.
      const e = err as { code?: number | string; stdout?: string }
      if (e.code === "ENOENT") throw err
      return e.stdout ?? ""
    }
  }
  let out = ""
  for (const tool of tools) {
    try {
      out = tool === "rg" ? await run("rg", rgArgs) : await run("git", gitArgs)
      break
    } catch {
      // Not installed (ENOENT): try the next tool.
    }
  }
  const matches: SearchMatch[] = []
  for (const raw of out.split("\n")) {
    const m = parseGrepLine(raw)
    if (!m) continue
    matches.push({ ...m, path: m.path.replace(/^\.\//, "") })
    if (matches.length >= limit) break
  }
  return matches
}

export interface FileReadResult {
  content: string | null
  binary: boolean
  size: number
  /** True when the file is bigger than the cap and `force` was not set. */
  tooLarge: boolean
}

const BINARY_SNIFF_BYTES = 8000
const MAX_VIEW_BYTES = 5 * 1024 * 1024

/** Same heuristic as git: a NUL byte in the first 8 KB means binary. */
export function isBinaryBuffer(buf: Buffer): boolean {
  return buf.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

async function looksBinary(absPath: string): Promise<boolean> {
  const fh = await open(absPath, "r")
  try {
    const buf = Buffer.alloc(BINARY_SNIFF_BYTES)
    const { bytesRead } = await fh.read(buf, 0, BINARY_SNIFF_BYTES, 0)
    return isBinaryBuffer(buf.subarray(0, bytesRead))
  } finally {
    await fh.close()
  }
}

/**
 * Read a worktree file for the viewer. Binary files (NUL in the first 8 KB)
 * and files over 5 MB come back without content unless `force` is set, so the
 * UI can offer "View as text anyway".
 */
export async function readWorktreeFile(worktreePath: string, relPath: string, force = false): Promise<FileReadResult> {
  const absPath = await resolveInsideWorktree(worktreePath, relPath)
  const { size } = await stat(absPath)
  const binary = await looksBinary(absPath)
  const tooLarge = size > MAX_VIEW_BYTES
  if (!force && (binary || tooLarge)) return { content: null, binary, size, tooLarge }
  return { content: await readFile(absPath, "utf8"), binary, size, tooLarge }
}

/** Write a file inside the worktree, creating parent directories as needed. */
export async function writeWorktreeFile(worktreePath: string, relPath: string, content: string): Promise<void> {
  const absPath = await resolveInsideWorktree(worktreePath, relPath)
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, content, "utf8")
}
