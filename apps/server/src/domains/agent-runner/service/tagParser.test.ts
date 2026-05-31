import { describe, expect, it } from "vitest"
import { z } from "zod/v4"
import { parseTagsFromText, dispatchTags, stripTagsFromBody } from "./tagParser.js"
import type { TagHandler } from "../agent-runner.types.js"

describe("parseTagsFromText", () => {
  it("returns an empty array for text with no huxflux tags", () => {
    expect(parseTagsFromText("just regular text")).toEqual([])
  })

  it("parses a well-formed paired tag with no attributes", () => {
    const out = parseTagsFromText(`<huxflux:agents.title>My new title</huxflux:agents.title>`)
    expect(out).toHaveLength(1)
    expect(out[0].namespace).toBe("agents")
    expect(out[0].kind).toBe("title")
    expect(out[0].id).toBe("agents.title")
    expect(out[0].body).toBe("My new title")
    expect(out[0].attrs).toEqual({})
  })

  it("parses a paired tag with multiple attributes", () => {
    const out = parseTagsFromText(
      `<huxflux:tasks.update taskId="t-1" field="description">new body</huxflux:tasks.update>`,
    )
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("tasks.update")
    expect(out[0].attrs).toEqual({ taskId: "t-1", field: "description" })
    expect(out[0].body).toBe("new body")
  })

  it("parses a self-closing tag", () => {
    const out = parseTagsFromText(`<huxflux:tasks.status taskId="t-1" status="done"/>`)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("tasks.status")
    expect(out[0].attrs).toEqual({ taskId: "t-1", status: "done" })
    expect(out[0].body).toBe("")
  })

  it("handles multi-line bodies", () => {
    const out = parseTagsFromText(
      `<huxflux:tasks.create parentId="t-1">{\n  "title": "Sub",\n  "description": "desc"\n}</huxflux:tasks.create>`,
    )
    expect(out).toHaveLength(1)
    expect(out[0].body).toContain(`"title": "Sub"`)
  })

  it("returns multiple tags in order of appearance", () => {
    const out = parseTagsFromText(
      `<huxflux:agents.title>One</huxflux:agents.title> middle <huxflux:agents.branch>two</huxflux:agents.branch>`,
    )
    expect(out.map((t) => t.id)).toEqual(["agents.title", "agents.branch"])
  })

  it("ignores tags whose open/close namespace.kind do not match", () => {
    const out = parseTagsFromText(`<huxflux:agents.title>hi</huxflux:agents.branch>`)
    expect(out).toEqual([])
  })

  it("ignores tags missing the dotted namespace.kind format", () => {
    // Legacy `<huxflux:title>` style — no dot — is silently dropped by the
    // structured parser (it still gets stripped from the body separately).
    const out = parseTagsFromText(`<huxflux:title>hi</huxflux:title>`)
    expect(out).toEqual([])
  })

  it("tolerates extra whitespace between attributes and the closing >", () => {
    const out = parseTagsFromText(
      `<huxflux:tasks.status   taskId="t-1"    status="done"   />`,
    )
    expect(out).toHaveLength(1)
    expect(out[0].attrs).toEqual({ taskId: "t-1", status: "done" })
  })

  it("returns an empty array on the empty string", () => {
    expect(parseTagsFromText("")).toEqual([])
  })

  it("preserves empty-string attribute values", () => {
    const out = parseTagsFromText(`<huxflux:demo.x foo="" bar="y"/>`)
    expect(out[0].attrs).toEqual({ foo: "", bar: "y" })
  })

  it("does not include the surrounding whitespace in the body", () => {
    const out = parseTagsFromText(`<huxflux:demo.x>\n  hi\n</huxflux:demo.x>`)
    expect(out[0].body).toBe("hi")
  })
})

describe("dispatchTags", () => {
  it("invokes the matching handler with validated args + body", async () => {
    const seen: Array<{ args: unknown; body: string }> = []
    const handler: TagHandler = {
      id: "tasks.comment",
      args: z.object({ taskId: z.string() }),
      onTag: (event) => { seen.push(event) },
    }
    const parsed = parseTagsFromText(`<huxflux:tasks.comment taskId="t-1">hi</huxflux:tasks.comment>`)
    await dispatchTags(parsed, [handler])
    expect(seen).toEqual([{ args: { taskId: "t-1" }, body: "hi" }])
  })

  it("skips tags with no matching handler", async () => {
    let called = false
    const handler: TagHandler = {
      id: "tasks.comment",
      args: z.object({}),
      onTag: () => { called = true },
    }
    const parsed = parseTagsFromText(`<huxflux:other.thing>x</huxflux:other.thing>`)
    await dispatchTags(parsed, [handler])
    expect(called).toBe(false)
  })

  it("skips (does not throw) when a tag's attrs fail validation", async () => {
    let called = false
    const handler: TagHandler = {
      id: "tasks.status",
      args: z.object({ taskId: z.string().min(1), status: z.string().min(1) }),
      onTag: () => { called = true },
    }
    const parsed = parseTagsFromText(`<huxflux:tasks.status status="done"/>`)
    await dispatchTags(parsed, [handler])
    expect(called).toBe(false)
  })

  it("awaits async handlers in order", async () => {
    const seen: string[] = []
    const handler: TagHandler = {
      id: "demo.echo",
      args: z.object({}),
      onTag: async ({ body }) => {
        await new Promise((r) => setTimeout(r, 1))
        seen.push(body)
      },
    }
    const parsed = parseTagsFromText(
      `<huxflux:demo.echo>a</huxflux:demo.echo><huxflux:demo.echo>b</huxflux:demo.echo>`,
    )
    await dispatchTags(parsed, [handler])
    expect(seen).toEqual(["a", "b"])
  })

  it("swallows handler exceptions and keeps processing later tags", async () => {
    const seen: string[] = []
    const handler: TagHandler = {
      id: "demo.echo",
      args: z.object({}),
      onTag: ({ body }) => {
        if (body === "boom") throw new Error("nope")
        seen.push(body)
      },
    }
    const parsed = parseTagsFromText(
      `<huxflux:demo.echo>boom</huxflux:demo.echo><huxflux:demo.echo>survive</huxflux:demo.echo>`,
    )
    await dispatchTags(parsed, [handler])
    expect(seen).toEqual(["survive"])
  })
})

describe("stripTagsFromBody", () => {
  it("removes well-formed paired tags", () => {
    const out = stripTagsFromBody(`before <huxflux:agents.title>x</huxflux:agents.title> after`)
    expect(out).toBe("before  after".trim())
  })

  it("removes self-closing tags", () => {
    const out = stripTagsFromBody(`a <huxflux:tasks.status taskId="t" status="done"/> b`)
    expect(out).toBe("a  b".trim())
  })

  it("removes legacy (non-dotted) tags too", () => {
    const out = stripTagsFromBody(`a <huxflux:title>old</huxflux:title> b`)
    expect(out).toBe("a  b".trim())
  })

  it("returns the original string when no tags are present", () => {
    expect(stripTagsFromBody("clean text")).toBe("clean text")
  })

  it("collapses excess blank lines left by stripped tags", () => {
    const out = stripTagsFromBody(`hi\n\n\n<huxflux:demo.x>z</huxflux:demo.x>\n\n\nbye`)
    expect(out).not.toMatch(/\n\n\n/)
  })

  it("returns an empty string on an empty input", () => {
    expect(stripTagsFromBody("")).toBe("")
  })

  it("strips multiple tags in the same body", () => {
    const out = stripTagsFromBody(
      `<huxflux:a.b>x</huxflux:a.b><huxflux:c.d>y</huxflux:c.d>middle<huxflux:e.f/>`,
    )
    expect(out).not.toContain("huxflux")
    expect(out).toContain("middle")
  })
})
