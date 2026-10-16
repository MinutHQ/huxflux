import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import { createGitTmpRepo, type GitTmpRepo } from "../../../test/harness.js"
import {
  PathOutsideWorktreeError, listAllFilePaths, listDirectory, readWorktreeFile,
  resolveInsideWorktree, searchFileContents, writeWorktreeFile,
} from "./files.js"

let repo: GitTmpRepo
let outside: string

function write(rel: string, content: string): void {
  const abs = path.join(repo.path, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

beforeEach(() => {
  repo = createGitTmpRepo()
  outside = mkdtempSync(path.join(tmpdir(), "huxflux-outside-"))
  writeFileSync(path.join(outside, "secret.txt"), "top secret")
})

afterEach(() => {
  repo.cleanup()
  rmSync(outside, { recursive: true, force: true })
})

describe("resolveInsideWorktree", () => {
  it("resolves a nested relative path", async () => {
    const abs = await resolveInsideWorktree(repo.path, "src/a.ts")
    expect(abs).toBe(path.join(path.resolve(repo.path), "src/a.ts"))
  })

  it("rejects parent traversal", async () => {
    await expect(resolveInsideWorktree(repo.path, "../x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    await expect(resolveInsideWorktree(repo.path, "src/../../x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("rejects absolute paths outside the worktree", async () => {
    await expect(resolveInsideWorktree(repo.path, path.join(outside, "secret.txt"))).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("rejects a symlink that points outside", async () => {
    symlinkSync(outside, path.join(repo.path, "escape"))
    await expect(resolveInsideWorktree(repo.path, "escape/secret.txt")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("rejects a dangling symlink, whose target cannot be checked", async () => {
    symlinkSync(path.join(outside, "not-there.txt"), path.join(repo.path, "dangling"))
    await expect(resolveInsideWorktree(repo.path, "dangling")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    await expect(writeWorktreeFile(repo.path, "dangling", "x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("allows names that merely start with two dots", async () => {
    expect(await resolveInsideWorktree(repo.path, "..foo/bar")).toBe(path.join(path.resolve(repo.path), "..foo/bar"))
  })

  it("accepts the root itself", async () => {
    expect(await resolveInsideWorktree(repo.path, "")).toBe(path.resolve(repo.path))
  })
})

describe("listDirectory", () => {
  it("lists one level, folders first, ignored entries flagged, .git hidden", async () => {
    write(".gitignore", "node_modules/\n*.log\n")
    write("b.ts", "b")
    write("a.log", "log")
    write("src/index.ts", "x")
    write("node_modules/pkg/index.js", "y")

    const entries = await listDirectory(repo.path)
    expect(entries.map((e) => e.name)).toEqual(["node_modules", "src", ".gitignore", "a.log", "b.ts"])
    expect(entries.find((e) => e.name === "node_modules")).toEqual({ name: "node_modules", path: "node_modules", type: "directory", ignored: true })
    expect(entries.find((e) => e.name === "a.log")?.ignored).toBe(true)
    expect(entries.find((e) => e.name === "src")?.ignored).toBe(false)
    expect(entries.some((e) => e.name === ".git")).toBe(false)
  })

  it("lists a sub-directory with prefixed paths", async () => {
    write("src/lib/util.ts", "u")
    write("src/main.ts", "m")
    const entries = await listDirectory(repo.path, "src")
    expect(entries).toEqual([
      { name: "lib", path: "src/lib", type: "directory", ignored: false },
      { name: "main.ts", path: "src/main.ts", type: "file", ignored: false },
    ])
  })

  it("refuses to list outside the worktree", async () => {
    await expect(listDirectory(repo.path, "..")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("works in a folder that is not a git repo", async () => {
    writeFileSync(path.join(outside, "plain.txt"), "p")
    const entries = await listDirectory(outside)
    expect(entries.map((e) => [e.name, e.ignored])).toEqual([["plain.txt", false], ["secret.txt", false]])
  })
})

describe("listAllFilePaths", () => {
  it("returns tracked and untracked files but not ignored ones", async () => {
    write(".gitignore", "dist/\n")
    write("tracked.ts", "t")
    execFileSync("git", ["add", "tracked.ts", ".gitignore"], { cwd: repo.path })
    write("untracked.ts", "u")
    write("dist/out.js", "o")
    expect(await listAllFilePaths(repo.path)).toEqual([".gitignore", "tracked.ts", "untracked.ts"])
  })
})

describe("searchFileContents", () => {
  it("finds case-insensitive fixed-string matches with line numbers", async () => {
    write("src/a.ts", "const one = 1\nconst NeedLE = 2\n")
    write("src/b.ts", "nothing here\n")
    const matches = await searchFileContents(repo.path, "needle")
    expect(matches).toEqual([{ path: "src/a.ts", line: 2, preview: "const NeedLE = 2" }])
  })

  it("treats regex characters literally and does not parse the query as a flag", async () => {
    write("a.txt", "call foo(.*)\n-v flag\n")
    expect(await searchFileContents(repo.path, "foo(.*)")).toEqual([{ path: "a.txt", line: 1, preview: "call foo(.*)" }])
    expect(await searchFileContents(repo.path, "-v")).toEqual([{ path: "a.txt", line: 2, preview: "-v flag" }])
  })

  it("searches dotfiles too", async () => {
    write(".env.example", "NEEDLE=1\n")
    expect(await searchFileContents(repo.path, "needle")).toEqual([{ path: ".env.example", line: 1, preview: "NEEDLE=1" }])
  })

  it("skips ignored files", async () => {
    write(".gitignore", "build/\n")
    write("build/x.js", "needle\n")
    expect(await searchFileContents(repo.path, "needle")).toEqual([])
  })

  it("returns nothing for a blank query", async () => {
    write("a.txt", "anything\n")
    expect(await searchFileContents(repo.path, "  ")).toEqual([])
  })
})

describe("readWorktreeFile", () => {
  it("returns text content", async () => {
    write("a.txt", "hello")
    expect(await readWorktreeFile(repo.path, "a.txt")).toEqual({ content: "hello", binary: false, size: 5, tooLarge: false })
  })

  it("withholds binary content unless forced", async () => {
    write("img.bin", "PNG\0\0data")
    expect(await readWorktreeFile(repo.path, "img.bin")).toEqual({ content: null, binary: true, size: 9, tooLarge: false })
    const forced = await readWorktreeFile(repo.path, "img.bin", true)
    expect(forced.binary).toBe(true)
    expect(forced.content).toBe("PNG\0\0data")
  })

  it("rejects traversal and reports missing files as ENOENT", async () => {
    await expect(readWorktreeFile(repo.path, "../x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    await expect(readWorktreeFile(repo.path, "missing.txt")).rejects.toMatchObject({ code: "ENOENT" })
  })
})

describe("writeWorktreeFile", () => {
  it("writes into new nested folders", async () => {
    await writeWorktreeFile(repo.path, "new/dir/file.ts", "content")
    expect(readFileSync(path.join(repo.path, "new/dir/file.ts"), "utf8")).toBe("content")
  })

  it("refuses to write outside the worktree", async () => {
    await expect(writeWorktreeFile(repo.path, "../evil.txt", "x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    symlinkSync(outside, path.join(repo.path, "escape"))
    await expect(writeWorktreeFile(repo.path, "escape/secret.txt", "x")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    expect(readFileSync(path.join(outside, "secret.txt"), "utf8")).toBe("top secret")
  })
})
