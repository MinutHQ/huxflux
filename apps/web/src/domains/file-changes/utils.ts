// Sentinel characters from the Unicode private-use area used by `stripHtml` to
// stash code blocks before stripping HTML, so user content can't collide with
// the placeholder. Two distinct chars to keep the restore regex simple.
const CODE_OPEN = ""
const CODE_CLOSE = ""
const CODE_RESTORE_RE = new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g")

/**
 * Strip HTML tags from a comment body while preserving fenced code blocks and
 * inline code. Used to sanitize PR comment bodies before passing them to
 * react-markdown.
 */
export function stripHtml(text: string): string {
  const codeBlocks: string[] = []
  // Preserve ```...``` and `...` markdown code blocks
  let result = text.replace(/```[\s\S]*?```|`[^`]+`/g, (m) => {
    codeBlocks.push(m)
    return `${CODE_OPEN}${codeBlocks.length - 1}${CODE_CLOSE}`
  })
  // Preserve <pre>/<code> HTML blocks by converting to markdown
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    codeBlocks.push("```\n" + cleaned + "\n```")
    return `${CODE_OPEN}${codeBlocks.length - 1}${CODE_CLOSE}`
  })
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    codeBlocks.push("`" + cleaned + "`")
    return `${CODE_OPEN}${codeBlocks.length - 1}${CODE_CLOSE}`
  })
  // Remove inline HTML tags AND their content (e.g. <sub>text</sub>)
  result = result.replace(/<(sub|sup|details|summary|picture|source|img|table|thead|tbody|tr|td|th)[^>]*>[\s\S]*?<\/\1>/gi, "")
  // Remove self-closing / void tags
  result = result.replace(/<(?:img|br|hr|input)[^>]*\/?>/gi, "")
  // Strip remaining tags but keep their text content (div, p, span, a, etc)
  result = result.replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, "")
  // Decode entities
  result = result.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  // Restore code blocks
  result = result.replace(CODE_RESTORE_RE, (_, i) => codeBlocks[parseInt(i)] ?? "")
  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n")
  return result.trim()
}

/**
 * Pick a Tailwind text-color class for a filename based on extension or
 * well-known filename. Used by the file tree icons.
 *
 * Note: design-system rules forbid `zinc/slate/gray` Tailwind scales, so
 * neutral/default colors map to `text-muted-foreground` variants instead.
 */
export function fileColor(name: string): string {
  const lower = name.toLowerCase()
  const nameMap: Record<string, string> = {
    ".gitignore": "text-red-500",
    ".git": "text-muted-foreground/50",
    ".env": "text-yellow-500",
    "dockerfile": "text-sky-400",
    "license": "text-muted-foreground/60",
    "readme.md": "text-muted-foreground/60",
  }
  if (nameMap[lower]) return nameMap[lower]!

  const ext = name.split(".").pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400",
    json: "text-amber-400",
    md: "text-sky-400",
    css: "text-pink-400", scss: "text-pink-400",
    html: "text-orange-400",
    yaml: "text-green-400", yml: "text-green-400",
    sh: "text-emerald-500",
    lock: "text-muted-foreground/40",
    toml: "text-muted-foreground/60",
    svg: "text-amber-300",
    png: "text-purple-400", jpg: "text-purple-400", gif: "text-purple-400",
    env: "text-yellow-500",
    sql: "text-orange-300",
    graphql: "text-pink-500",
    py: "text-yellow-300",
    go: "text-cyan-400",
    rs: "text-orange-400",
    rb: "text-red-400",
  }
  return colorMap[ext ?? ""] ?? "text-muted-foreground/50"
}

