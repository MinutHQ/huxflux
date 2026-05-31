import { describe, expect, it } from "vitest"
import { parseUnifiedDiff, tokenize } from "./diff.js"

describe("parseUnifiedDiff", () => {
  it("parses a hunk header and yields its `hunk` line", () => {
    const out = parseUnifiedDiff("@@ -1,3 +1,3 @@\n a\n-b\n+B\n")
    const first = out[0]
    expect(first).toBeDefined()
    expect(first!.type).toBe("hunk")
    expect(first!.text.startsWith("@@")).toBe(true)
  })

  it("classifies added, deleted, and context lines distinctly", () => {
    const out = parseUnifiedDiff("@@ -1,1 +1,2 @@\n keep\n+added\n-removed\n")
    const types = out.map((l) => l.type)
    expect(types).toContain("ctx")
    expect(types).toContain("add")
    expect(types).toContain("del")
  })

  it("assigns sequential line numbers tracking from the @@ marker", () => {
    const raw = "@@ -10,2 +20,2 @@\n keep\n+added\n"
    const out = parseUnifiedDiff(raw)
    const ctxLine = out.find((l) => l.type === "ctx")
    const addLine = out.find((l) => l.type === "add")
    expect(ctxLine?.lineNo).toBe(20)
    expect(addLine?.lineNo).toBe(21)
  })

  it("skips meta lines (---, +++, diff, index)", () => {
    const raw = [
      "diff --git a/x b/x",
      "index abc..def 100644",
      "--- a/x",
      "+++ b/x",
      "@@ -1,1 +1,1 @@",
      "+only-add",
    ].join("\n")
    const out = parseUnifiedDiff(raw)
    expect(out.filter((l) => l.type === "hunk")).toHaveLength(1)
    expect(out.filter((l) => l.type === "add")).toHaveLength(1)
    // No spurious entries for the meta lines
    expect(out).toHaveLength(2)
  })

  it("handles an empty input by returning an empty array", () => {
    expect(parseUnifiedDiff("")).toEqual([])
  })
})

describe("tokenize", () => {
  it("identifies keywords distinctly from identifiers", () => {
    const tokens = tokenize("const foo = 1")
    expect(tokens.find((t) => t.text === "const")?.cls).toBe("keyword")
    expect(tokens.find((t) => t.text === "foo")?.cls).toBe("identifier")
  })

  it("classifies double-quoted strings", () => {
    const tokens = tokenize('"hello"')
    const strTok = tokens.find((t) => t.cls === "string")
    expect(strTok?.text).toBe('"hello"')
  })

  it("recognizes comments", () => {
    const tokens = tokenize("// remark")
    expect(tokens.find((t) => t.cls === "comment")?.text).toBe("// remark")
  })

  it("returns an empty array for an empty input", () => {
    expect(tokenize("")).toEqual([])
  })
})
