// Atlassian Document Format (ADF) → Markdown converter for Jira descriptions.
// Jira's REST API returns description fields as nested JSON nodes; this
// flattens them into a markdown string the rest of the system understands.

interface AdfNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  marks?: AdfNode[]
}

/** Convert Jira ADF (Atlassian Document Format) to Markdown */
export function extractDescription(desc: unknown): string | null {
  if (!desc) return null
  if (typeof desc === "string") return desc
  const node = desc as AdfNode
  if (node.type === "doc" && Array.isArray(node.content)) {
    return adfToMarkdown(node.content).trim() || null
  }
  return null
}

export function adfToMarkdown(nodes: AdfNode[], listDepth = 0): string {
  const parts: string[] = []

  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        parts.push(adfInline(node.content ?? []))
        parts.push("\n\n")
        break
      case "heading": {
        const level = (node.attrs?.level as number | undefined) ?? 1
        parts.push("#".repeat(level) + " " + adfInline(node.content ?? []))
        parts.push("\n\n")
        break
      }
      case "bulletList":
        parts.push(adfList(node.content ?? [], "bullet", listDepth))
        if (listDepth === 0) parts.push("\n")
        break
      case "orderedList":
        parts.push(adfList(node.content ?? [], "ordered", listDepth))
        if (listDepth === 0) parts.push("\n")
        break
      case "listItem":
        // handled by adfList
        break
      case "codeBlock": {
        const lang = (node.attrs?.language as string | undefined) ?? ""
        const code = adfInline(node.content ?? [])
        parts.push("```" + lang + "\n" + code + "\n```\n\n")
        break
      }
      case "blockquote": {
        const bqLines = adfToMarkdown(node.content ?? []).trim().split("\n")
        parts.push(bqLines.map((l: string) => "> " + l).join("\n"))
        parts.push("\n\n")
        break
      }
      case "rule":
        parts.push("---\n\n")
        break
      case "table":
        parts.push(adfTable(node))
        parts.push("\n")
        break
      case "mediaSingle":
      case "media":
        parts.push("[media]\n\n")
        break
      default:
        if (Array.isArray(node.content)) {
          parts.push(adfToMarkdown(node.content, listDepth))
        }
    }
  }

  return parts.join("")
}

function adfInline(nodes: AdfNode[]): string {
  if (!nodes) return ""
  return nodes.map((n) => renderInlineNode(n)).join("")
}

function renderInlineNode(n: AdfNode): string {
  if (n.type === "text") {
    let text = n.text ?? ""
    const marks = n.marks ?? []
    for (const mark of marks) {
      switch (mark.type) {
        case "strong": text = `**${text}**`; break
        case "em": text = `*${text}*`; break
        case "code": text = `\`${text}\``; break
        case "strike": text = `~~${text}~~`; break
        case "link": text = `[${text}](${(mark.attrs?.href as string | undefined) ?? ""})`; break
      }
    }
    return text
  }
  if (n.type === "hardBreak") return "\n"
  if (n.type === "mention") return `@${(n.attrs?.text as string | undefined) ?? "user"}`
  if (n.type === "emoji") return (n.attrs?.shortName as string | undefined) ?? ""
  if (n.type === "inlineCard") return (n.attrs?.url as string | undefined) ?? "[link]"
  return ""
}

function adfList(items: AdfNode[], style: "bullet" | "ordered", depth: number): string {
  const parts: string[] = []
  const indent = "  ".repeat(depth)

  items.forEach((item, i) => {
    if (item.type !== "listItem") return
    const prefix = style === "bullet" ? "- " : `${i + 1}. `
    const content = item.content ?? []
    // First child is usually a paragraph — render inline
    const first = content[0]
    if (first?.type === "paragraph") {
      parts.push(indent + prefix + adfInline(first.content ?? []) + "\n")
    }
    // Remaining children (nested lists, etc.)
    for (let j = 1; j < content.length; j++) {
      const next = content[j]
      if (next) parts.push(adfToMarkdown([next], depth + 1))
    }
  })

  return parts.join("")
}

function adfTable(node: AdfNode): string {
  const rows: string[][] = []
  for (const row of node.content ?? []) {
    const cells: string[] = []
    for (const cell of row.content ?? []) {
      cells.push(adfToMarkdown(cell.content ?? []).trim().replace(/\n/g, " "))
    }
    rows.push(cells)
  }
  if (rows.length === 0) return ""
  const firstRow = rows[0]
  if (!firstRow) return ""
  const header = "| " + firstRow.join(" | ") + " |"
  const sep = "| " + firstRow.map(() => "---").join(" | ") + " |"
  const body = rows.slice(1).map((r) => "| " + r.join(" | ") + " |").join("\n")
  return [header, sep, body].filter(Boolean).join("\n") + "\n"
}
