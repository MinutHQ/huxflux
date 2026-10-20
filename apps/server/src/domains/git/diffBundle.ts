import { spawn } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { simpleGit } from "simple-git"
import { isBinaryBuffer, resolveInsideWorktree } from "./files.js"

export interface FileDiffBundle {
  path: string
  diff: string
  oldContent: string
  newContent: string
}

/** Above this size the full contents are left out; the diff still renders, only context expansion is lost. */
const MAX_CONTENT_BYTES = 1024 * 1024

/**
 * Split a multi-file unified diff into one chunk per file, keyed by the new
 * path (or the old path for deletions). Expects `--no-renames` output.
 */
export function splitUnifiedDiff(raw: string): Map<string, string> {
  const chunks = new Map<string, string>()
  const parts = raw.split(/^(?=diff --git )/m).filter((p) => p.startsWith("diff --git "))
  for (const part of parts) {
    const plus = /^\+\+\+ (?:b\/)?(.+?)\t?$/m.exec(part)?.[1]
    const minus = /^--- (?:a\/)?(.+?)\t?$/m.exec(part)?.[1]
    let path = plus && plus !== "/dev/null" ? plus : minus && minus !== "/dev/null" ? minus : undefined
    if (!path) {
      // Binary or mode-only change: no ---/+++ lines; fall back to the header.
      path = /^diff --git a\/.+? b\/(.+)$/m.exec(part)?.[1]
    }
    if (path) chunks.set(path, part)
  }
  return chunks
}

/**
 * Read many `<rev>:<path>` blobs through one `git cat-file --batch` process.
 * Missing objects (the file does not exist at that revision) and binary
 * blobs map to "".
 */
export function readBlobs(worktreePath: string, rev: string, paths: string[]): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const out = new Map<string, string>()
    if (paths.length === 0) return resolve(out)
    const child = spawn("git", ["cat-file", "--batch"], { cwd: worktreePath })
    const buffers: Buffer[] = []
    child.stdout.on("data", (b: Buffer) => buffers.push(b))
    child.on("error", () => resolve(out))
    child.on("close", () => {
      const buf = Buffer.concat(buffers)
      let pos = 0
      for (const path of paths) {
        const nl = buf.indexOf(0x0a, pos)
        if (nl < 0) break
        const header = buf.subarray(pos, nl).toString("utf8")
        pos = nl + 1
        const m = /^\S+ (\w+) (\d+)$/.exec(header)
        if (!m) { out.set(path, ""); continue }
        const size = Number(m[2])
        const blob = buf.subarray(pos, pos + size)
        out.set(path, m[1] === "blob" && size <= MAX_CONTENT_BYTES && !isBinaryBuffer(blob) ? blob.toString("utf8") : "")
        pos += size + 1
      }
      resolve(out)
    })
    child.stdin.end(paths.map((p) => `${rev}:${p}`).join("\n") + "\n")
  })
}

async function readWorkingCopy(worktreePath: string, relPath: string): Promise<string> {
  try {
    const abs = await resolveInsideWorktree(worktreePath, relPath)
    const { size } = await stat(abs)
    if (size > MAX_CONTENT_BYTES) return ""
    const buf = await readFile(abs)
    return isBinaryBuffer(buf) ? "" : buf.toString("utf8")
  } catch {
    return ""
  }
}

function syntheticAddition(path: string, content: string): string {
  const lines = content.split("\n")
  return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`
}

/**
 * Diff, base content and working content for many files at once, against an
 * already resolved base commit. One `git diff`, one `git cat-file --batch`,
 * plus plain file reads, instead of several git processes per file.
 * Files without a git diff (untracked) get a synthetic full addition.
 * Binary files get an empty diff, so the UI shows its "no textual diff" note.
 */
export async function getDiffBundle(worktreePath: string, base: string, paths: string[]): Promise<FileDiffBundle[]> {
  const git = simpleGit(worktreePath)
  const [raw, oldContents, newContents] = await Promise.all([
    git.raw(["-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-renames", "-U2", base]).catch(() => ""),
    readBlobs(worktreePath, base, paths),
    Promise.all(paths.map((p) => readWorkingCopy(worktreePath, p))),
  ])
  const chunks = splitUnifiedDiff(raw)
  return paths.map((path, i) => {
    const newContent = newContents[i] ?? ""
    const chunk = chunks.get(path)
    return {
      path,
      // A chunk without hunks is a binary or mode-only change ("Binary files ... differ").
      diff: chunk !== undefined ? (/^@@ /m.test(chunk) ? chunk : "") : newContent ? syntheticAddition(path, newContent) : "",
      oldContent: oldContents.get(path) ?? "",
      newContent,
    }
  })
}
