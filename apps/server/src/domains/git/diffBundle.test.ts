import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import { createGitTmpRepo, type GitTmpRepo } from "../../../test/harness.js"
import { getDiffBundle, readBlobs, splitUnifiedDiff } from "./diffBundle.js"
import { getBaseFileContent, getDiff, getFileChanges, resolveDiffBase } from "./worktrees.js"

let repo: GitTmpRepo

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: repo.path, stdio: "ignore" })
}

function write(rel: string, content: string): void {
  const abs = path.join(repo.path, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

// main: keep.txt, edit.txt, gone.txt. feature: edit.txt changed and committed,
// new.txt committed, gone.txt deleted, then "dir with space/x.ts" edited
// uncommitted and untracked.txt left untracked.
beforeEach(() => {
  repo = createGitTmpRepo()
  write("keep.txt", "keep\n")
  write("edit.txt", "one\ntwo\nthree\n")
  write("gone.txt", "bye\n")
  write("dir with space/x.ts", "export const x = 1\n")
  git("add", ".")
  git("commit", "-q", "-m", "base")
  git("checkout", "-q", "-b", "feature")
  write("edit.txt", "one\nTWO\nthree\n")
  write("new.txt", "fresh\n")
  rmSync(path.join(repo.path, "gone.txt"))
  git("add", "-A")
  git("commit", "-q", "-m", "feature")
  write("dir with space/x.ts", "export const x = 2\n")
  write("untracked.txt", "loose\n")
})

afterEach(() => repo.cleanup())

describe("getDiffBundle", () => {
  it("matches the per-file diff and contents for every kind of change", async () => {
    const files = (await getFileChanges(repo.path, "main")).map((f) => f.path).sort()
    expect(files).toEqual(["dir with space/x.ts", "edit.txt", "gone.txt", "new.txt", "untracked.txt"])

    const base = await resolveDiffBase(repo.path, "main", "branch")
    const bundle = await getDiffBundle(repo.path, base, files)
    for (const b of bundle) {
      expect(b.diff).toBe(await getDiff(repo.path, b.path, "main"))
      expect(b.oldContent).toBe(await getBaseFileContent(repo.path, b.path, "main"))
    }
    const byPath = new Map(bundle.map((b) => [b.path, b]))
    expect(byPath.get("edit.txt")?.newContent).toBe("one\nTWO\nthree\n")
    expect(byPath.get("gone.txt")).toMatchObject({ newContent: "", oldContent: "bye\n" })
    expect(byPath.get("untracked.txt")?.diff).toContain("+loose")
    expect(byPath.get("dir with space/x.ts")?.diff).toContain("+export const x = 2")
  })

  it("uses HEAD as the base in uncommitted mode", async () => {
    const base = await resolveDiffBase(repo.path, "main", "uncommitted")
    const [edit] = await getDiffBundle(repo.path, base, ["edit.txt"])
    // edit.txt is committed on the branch and clean in the working tree.
    expect(edit?.oldContent).toBe("one\nTWO\nthree\n")
  })
})

describe("splitUnifiedDiff", () => {
  it("keys chunks by new path and by old path for deletions", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts", "index 1..2 100644", "--- a/a.ts", "+++ b/a.ts", "@@ -1 +1 @@", "-x", "+y",
      "diff --git a/b.ts b/b.ts", "deleted file mode 100644", "--- a/b.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-z", "",
    ].join("\n")
    const chunks = splitUnifiedDiff(raw)
    expect([...chunks.keys()]).toEqual(["a.ts", "b.ts"])
    expect(chunks.get("a.ts")).toContain("+y")
    expect(chunks.get("b.ts")).toContain("-z")
  })

  it("handles binary chunks without ---/+++ lines", () => {
    const raw = "diff --git a/img.png b/img.png\nindex 1..2 100644\nBinary files a/img.png and b/img.png differ\n"
    expect([...splitUnifiedDiff(raw).keys()]).toEqual(["img.png"])
  })
})

describe("readBlobs", () => {
  it("returns blob text and empty strings for paths missing at the revision", async () => {
    const blobs = await readBlobs(repo.path, "main", ["keep.txt", "new.txt", "gone.txt"])
    expect(blobs.get("keep.txt")).toBe("keep\n")
    expect(blobs.get("new.txt")).toBe("")
    expect(blobs.get("gone.txt")).toBe("bye\n")
  })
})
