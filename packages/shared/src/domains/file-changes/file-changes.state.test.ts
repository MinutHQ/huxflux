import { describe, expect, it } from "vitest"
import {
  ancestorDirs, buildChangedFileTree, buildLineCommentsBlock, flattenChangedTree, fuzzyFilterPaths,
  groupSearchMatches, matchPath, orderChangedFiles,
} from "./file-changes.state.js"

const files = [
  { path: "docs/agent-api.md", additions: 387, deletions: 0 },
  { path: ".claude/pre-push.md", additions: 197, deletions: 0 },
  { path: ".env.bak", additions: 117, deletions: 0 },
  { path: "src/lib/util/a.ts", additions: 2, deletions: 1 },
  { path: "src/lib/util/b.ts", additions: 3, deletions: 4 },
]

describe("buildChangedFileTree", () => {
  it("puts folders first, sorts by name and sums +/- per folder", () => {
    const tree = buildChangedFileTree(files)
    expect(tree.map((n) => [n.type, n.name])).toEqual([
      ["directory", ".claude"],
      ["directory", "docs"],
      ["directory", "src/lib/util"],
      ["file", ".env.bak"],
    ])
    const src = tree[2]
    expect(src).toMatchObject({ path: "src/lib/util", additions: 5, deletions: 5 })
  })

  it("compacts single-child folder chains but keeps the deepest path", () => {
    const tree = buildChangedFileTree([{ path: "a/b/c/file.ts", additions: 1, deletions: 0 }])
    expect(tree).toEqual([{
      type: "directory", name: "a/b/c", path: "a/b/c", additions: 1, deletions: 0,
      children: [{ type: "file", name: "file.ts", path: "a/b/c/file.ts", additions: 1, deletions: 0 }],
    }])
  })

  it("does not compact a folder that also holds files", () => {
    const tree = buildChangedFileTree([
      { path: "a/x.ts", additions: 1, deletions: 0 },
      { path: "a/b/y.ts", additions: 1, deletions: 0 },
    ])
    expect(tree[0]?.name).toBe("a")
    expect(tree[0]?.type === "directory" && tree[0].children.map((c) => c.name)).toEqual(["b", "x.ts"])
  })

  it("returns an empty tree for no files", () => {
    expect(buildChangedFileTree([])).toEqual([])
  })
})

describe("flattenChangedTree", () => {
  it("flattens depth-first with depths and hides collapsed folders' children", () => {
    const tree = buildChangedFileTree(files)
    const all = flattenChangedTree(tree, new Set())
    expect(all.map((r) => [r.node.name, r.depth])).toEqual([
      [".claude", 0], ["pre-push.md", 1],
      ["docs", 0], ["agent-api.md", 1],
      ["src/lib/util", 0], ["a.ts", 1], ["b.ts", 1],
      [".env.bak", 0],
    ])
    const collapsed = flattenChangedTree(tree, new Set(["docs", "src/lib/util"]))
    expect(collapsed.map((r) => r.node.name)).toEqual([".claude", "pre-push.md", "docs", "src/lib/util", ".env.bak"])
  })
})

describe("orderChangedFiles", () => {
  it("returns files in tree order and keeps their payload", () => {
    const ordered = orderChangedFiles(files.map((f) => ({ ...f, diff: `d:${f.path}` })))
    expect(ordered.map((f) => f.path)).toEqual([
      ".claude/pre-push.md", "docs/agent-api.md", "src/lib/util/a.ts", "src/lib/util/b.ts", ".env.bak",
    ])
    expect(ordered[0]?.diff).toBe("d:.claude/pre-push.md")
  })
})

describe("matchPath", () => {
  it("matches a case-insensitive subsequence and reports indices", () => {
    expect(matchPath("src/FooBar.ts", "fb")?.indices).toEqual([4, 7])
  })

  it("returns null when characters are missing or out of order", () => {
    expect(matchPath("src/foo.ts", "zz")).toBeNull()
    expect(matchPath("abc", "cba")).toBeNull()
  })

  it("ignores whitespace in the query and matches everything for an empty query", () => {
    expect(matchPath("src/foo.ts", "f o")).not.toBeNull()
    expect(matchPath("src/foo.ts", "")).toEqual({ path: "src/foo.ts", score: 0, indices: [] })
  })
})

describe("fuzzyFilterPaths", () => {
  it("ranks file-name prefix matches above deep path matches", () => {
    const paths = ["packages/ui/src/index.ts", "index.ts", "src/domains/indexing/foo.ts", "README.md"]
    expect(fuzzyFilterPaths(paths, "index").map((m) => m.path)).toEqual([
      "index.ts", "packages/ui/src/index.ts", "src/domains/indexing/foo.ts",
    ])
  })

  it("respects the limit", () => {
    const paths = Array.from({ length: 10 }, (_, i) => `f${i}.ts`)
    expect(fuzzyFilterPaths(paths, "f", 3)).toHaveLength(3)
  })
})

describe("groupSearchMatches", () => {
  it("groups by path in first-seen order", () => {
    const groups = groupSearchMatches([
      { path: "b.ts", line: 1, preview: "x" },
      { path: "a.ts", line: 4, preview: "y" },
      { path: "b.ts", line: 9, preview: "z" },
    ])
    expect(groups.map((g) => [g.path, g.matches.map((m) => m.line)])).toEqual([["b.ts", [1, 9]], ["a.ts", [4]]])
  })
})

describe("ancestorDirs", () => {
  it("lists every parent folder outermost first", () => {
    expect(ancestorDirs("a/b/c.ts")).toEqual(["a", "a/b"])
    expect(ancestorDirs("c.ts")).toEqual([])
  })
})

describe("buildLineCommentsBlock", () => {
  const comment = { id: "1", author: "You", body: "why\nthis?", createdAt: "", url: "", isReply: false, path: "src/a.ts", line: 12 }

  it("prefixes the message with each comment, quoted, with path:line", () => {
    expect(buildLineCommentsBlock([comment], "please fix")).toBe(
      "PR review comments:\n\n@You on `src/a.ts:12`:\n> why\n> this?\n\n---\n\nplease fix",
    )
  })

  it("returns the message untouched when there are no comments", () => {
    expect(buildLineCommentsBlock([], "hi")).toBe("hi")
  })
})
