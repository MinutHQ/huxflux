import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import * as path from "node:path"
import { createGitTmpRepo, type GitTmpRepo } from "../../../test/harness.js"
import { getBaseFileContent, getDiff, getFileChanges, getFileContent } from "./worktrees.js"

let repo: GitTmpRepo

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo.path, stdio: "ignore" })
}

function write(rel: string, content: string): void {
  writeFileSync(path.join(repo.path, rel), content)
}

// main: base.txt = "base\n". feature branch: committed.txt added and committed,
// then base.txt edited and dirty.txt created without committing.
beforeEach(() => {
  repo = createGitTmpRepo()
  write("base.txt", "base\n")
  git("add", ".")
  git("commit", "-q", "-m", "base")
  git("checkout", "-q", "-b", "feature")
  write("committed.txt", "committed\n")
  git("add", ".")
  git("commit", "-q", "-m", "feature work")
  write("base.txt", "base\nedited\n")
  write("dirty.txt", "dirty\n")
})

afterEach(() => repo.cleanup())

describe("getFileChanges", () => {
  it("branch mode includes committed, uncommitted and untracked files", async () => {
    const files = await getFileChanges(repo.path, "main")
    expect(files.map((f) => f.path).sort()).toEqual(["base.txt", "committed.txt", "dirty.txt"])
  })

  it("uncommitted mode leaves out work already committed on the branch", async () => {
    const files = await getFileChanges(repo.path, "main", "uncommitted")
    expect(files.map((f) => f.path).sort()).toEqual(["base.txt", "dirty.txt"])
    expect(files.find((f) => f.path === "base.txt")).toEqual({ path: "base.txt", additions: 1, deletions: 0 })
  })
})

describe("getFileChanges counts", () => {
  it("counts an edit to a file that is new on the branch as part of one pure addition", async () => {
    // committed.txt is new on the branch; rewrite its only line without committing.
    write("committed.txt", "rewritten\n")
    const files = await getFileChanges(repo.path, "main")
    expect(files.find((f) => f.path === "committed.txt")).toEqual({ path: "committed.txt", additions: 1, deletions: 0 })
  })

  it("counts a modified base file once against the base", async () => {
    const files = await getFileChanges(repo.path, "main")
    expect(files.find((f) => f.path === "base.txt")).toEqual({ path: "base.txt", additions: 1, deletions: 0 })
  })
})

describe("getDiff", () => {
  it("branch mode diffs a committed file against the merge-base", async () => {
    expect(await getDiff(repo.path, "committed.txt", "main")).toContain("+committed")
  })

  it("uncommitted mode shows nothing for a file only changed in commits", async () => {
    // The file exists at HEAD unchanged, so there is no diff to show.
    expect(await getDiff(repo.path, "committed.txt", "main", "uncommitted")).toBe("")
  })

  it("uncommitted mode diffs the working tree against HEAD", async () => {
    const diff = await getDiff(repo.path, "base.txt", "main", "uncommitted")
    expect(diff).toContain("+edited")
    expect(diff).not.toContain("+base")
  })

  it("returns an empty diff for a path outside the worktree", async () => {
    expect(await getDiff(repo.path, "../../etc/passwd", "main")).toBe("")
  })
})

describe("getBaseFileContent", () => {
  it("returns the merge-base version in branch mode and HEAD in uncommitted mode", async () => {
    expect(await getBaseFileContent(repo.path, "committed.txt", "main")).toBe("")
    expect(await getBaseFileContent(repo.path, "committed.txt", "main", "uncommitted")).toBe("committed\n")
  })
})

describe("getFileContent", () => {
  it("does not read outside the worktree", async () => {
    expect(await getFileContent(repo.path, "../../../../etc/hosts")).toBe("")
  })
})
