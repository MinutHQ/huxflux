// Generic `<huxflux:NAMESPACE.KIND ...>body</huxflux:NAMESPACE.KIND>` tag
// parser + dispatcher. Used by `runAgent` to extract structured tag events
// from an assistant message and route them to caller-provided handlers.
//
// The runner itself has no knowledge of any specific tag id. Each call site
// declares which tags it cares about via `TagHandler` entries; this module is
// the only place that understands the wire format.

import type { ParsedTag, TagHandler } from "../agent-runner.types.js"

// Matches a paired tag with a body:
//   <huxflux:foo.bar attr1="v1" attr2="v2">body</huxflux:foo.bar>
// Whitespace around attributes is tolerated. Body capture is non-greedy and
// matches across newlines.
const PAIRED_TAG_RE = /<huxflux:([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)((?:\s+[a-zA-Z_][\w-]*="[^"]*")*)\s*>([\s\S]*?)<\/huxflux:\1\.\2>/g

// Matches a self-closing tag (no body):
//   <huxflux:foo.bar attr1="v1"/>
const SELF_CLOSING_TAG_RE = /<huxflux:([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)((?:\s+[a-zA-Z_][\w-]*="[^"]*")*)\s*\/>/g

// Catch-all that matches every `<huxflux:*>...</huxflux:*>` or `<huxflux:*/>`
// for the strip step. Intentionally lenient so it also removes legacy or
// malformed tags that the structured parser ignored.
const ANY_HUXFLUX_TAG_RE = /<huxflux:[^>]*?\/>|<huxflux:([^\s>]+)\b[^>]*?>[\s\S]*?<\/huxflux:\1>/g

const ATTR_RE = /([a-zA-Z_][\w-]*)="([^"]*)"/g

/**
 * Extract every well-formed `<huxflux:NAMESPACE.KIND ...>body</...>` tag (or
 * its self-closing form) from a text blob. Order of returned tags matches
 * their order of appearance in the input.
 */
export function parseTagsFromText(text: string): ParsedTag[] {
  if (!text || !text.includes("<huxflux:")) return []

  const tags: Array<ParsedTag & { _index: number }> = []

  // Paired tags
  for (const m of text.matchAll(PAIRED_TAG_RE)) {
    const [, namespace, kind, attrsRaw, body] = m
    tags.push({
      _index: m.index ?? 0,
      namespace,
      kind,
      id: `${namespace}.${kind}`,
      attrs: parseAttrs(attrsRaw),
      body: body.trim(),
    })
  }

  // Self-closing tags
  for (const m of text.matchAll(SELF_CLOSING_TAG_RE)) {
    const [, namespace, kind, attrsRaw] = m
    tags.push({
      _index: m.index ?? 0,
      namespace,
      kind,
      id: `${namespace}.${kind}`,
      attrs: parseAttrs(attrsRaw),
      body: "",
    })
  }

  return tags
    .sort((a, b) => a._index - b._index)
    .map(({ _index: _i, ...rest }) => rest)
}

/**
 * Dispatch parsed tags to matching handlers. Each tag is matched by `id`,
 * its attributes are validated against the handler's Zod schema, and
 * `onTag({ args, body })` is invoked. Validation failures and handler
 * exceptions are logged and swallowed so one bad tag never aborts the rest.
 */
export async function dispatchTags(parsed: ParsedTag[], handlers: TagHandler[]): Promise<void> {
  if (parsed.length === 0 || handlers.length === 0) return
  const byId = new Map<string, TagHandler>()
  for (const h of handlers) byId.set(h.id, h)

  for (const tag of parsed) {
    const handler = byId.get(tag.id)
    if (!handler) continue
    const result = handler.args.safeParse(tag.attrs)
    if (!result.success) {
      console.warn(`[tags] dropped <huxflux:${tag.id}>: invalid attrs ${result.error.message}`)
      continue
    }
    try {
      await handler.onTag({ args: result.data, body: tag.body })
    } catch (err) {
      console.error(`[tags] handler for <huxflux:${tag.id}> threw:`, err)
    }
  }
}

/**
 * Remove every `<huxflux:*>` tag from a text blob so the persisted chat
 * content never includes the wire-format directives. Trailing newlines that
 * followed a stripped tag are collapsed.
 */
export function stripTagsFromBody(text: string): string {
  if (!text || !text.includes("<huxflux:")) return text
  return text
    .replace(ANY_HUXFLUX_TAG_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const m of raw.matchAll(ATTR_RE)) {
    out[m[1]] = m[2]
  }
  return out
}
