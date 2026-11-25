import { View, Text } from "react-native"
import { c } from "@/theme"
import { InlineContent } from "./MarkdownInline"
import { mapOutsideCode } from "./markdownText"
import { isTableSeparator, parseTableRow, TableView } from "./MarkdownTable"

interface MarkdownProps {
  content: string
  fontSize?: number
}

// ── Preprocess HTML blocks ──────────────────────────────────────────────────

function preprocessContent(content: string): string {
  return mapOutsideCode(content, convertHtml)
}

function convertHtml(content: string): string {
  let s = content
  // Convert <br> to newlines
  s = s.replace(/<br\s*\/?>/gi, "\n")
  // Convert block-level HTML to markdown
  s = s.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, text) => "#".repeat(parseInt(level)) + " " + text)
  s = s.replace(/<p[^>]*>(.*?)<\/p>/gis, (_, text) => text + "\n")
  s = s.replace(/<li[^>]*>(.*?)<\/li>/gis, (_, text) => "- " + text.trim())
  s = s.replace(/<\/?(?:ul|ol|div|span|section|article|header|footer|main|nav|aside|details|summary|figure|figcaption)[^>]*>/gi, "")
  s = s.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, text) =>
    text.trim().split("\n").map((l: string) => "> " + l).join("\n")
  )
  s = s.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, (_, code) => "```\n" + code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") + "\n```")
  // Convert inline HTML
  s = s.replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
  s = s.replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*")
  s = s.replace(/<(del|s)>(.*?)<\/\1>/gi, "~~$2~~")
  s = s.replace(/<code>(.*?)<\/code>/gi, "`$1`")
  s = s.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
  s = s.replace(/<img\s+[^>]*alt="([^"]*)"[^>]*\/?>/gi, "[$1]")
  s = s.replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi, "[image]($1)")
  // Strip remaining HTML tags
  s = s.replace(/<\/?[^>]+>/g, "")
  // Decode HTML entities
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  return s
}

// ── Main component ──────────────────────────────────────────────────────────

export function Markdown({ content, fontSize = 13 }: MarkdownProps) {
  const processed = preprocessContent(content)
  const lines = processed.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      elements.push(
        <View key={key++} style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 6, padding: 10, marginVertical: 4 }}>
          <Text style={{ fontFamily: "monospace", fontSize: fontSize - 2, color: c.fgBright, lineHeight: (fontSize - 2) * 1.6 }}>
            {codeLines.join("\n")}
          </Text>
        </View>
      )
      continue
    }

    // Table: header row followed by separator row
    if (i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1])) {
      const headerRow = parseTableRow(line)
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes("|") && !isTableSeparator(lines[i])) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      elements.push(<TableView key={key++} headerRow={headerRow} rows={rows} fontSize={fontSize} />)
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<View key={key++} style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} />)
      i++
      continue
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<View key={key++} style={{ height: 6 }} />)
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const headingSize = fontSize + (4 - Math.min(level, 4)) * 2
      elements.push(
        <Text key={key++} style={{ color: c.fgBright, fontSize: headingSize, fontWeight: "700", marginTop: 6, marginBottom: 2 }}>
          {headingMatch[2]}
        </Text>
      )
      i++
      continue
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = []
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      elements.push(
        <View key={key++} style={{ borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: 10, marginVertical: 2 }}>
          <InlineContent text={quoteLines.join("\n")} fontSize={fontSize} />
        </View>
      )
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s/.test(line)) {
      const listItems: { indent: number; text: string }[] = []
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)[-*+]\s(.+)/)
        if (m) listItems.push({ indent: m[1].length, text: m[2] })
        i++
      }
      elements.push(
        <View key={key++} style={{ marginVertical: 2 }}>
          {listItems.map((item, j) => (
            <View key={j} style={{ flexDirection: "row", paddingLeft: Math.min(item.indent, 8) * 2, marginVertical: 1 }}>
              <Text style={{ color: c.fgSub, fontSize, width: 16 }}>•</Text>
              <View style={{ flex: 1 }}>
                <InlineContent text={item.text} fontSize={fontSize} />
              </View>
            </View>
          ))}
        </View>
      )
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const listItems: { num: string; text: string }[] = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^\s*(\d+)\.\s(.+)/)
        if (m) listItems.push({ num: m[1], text: m[2] })
        i++
      }
      elements.push(
        <View key={key++} style={{ marginVertical: 2 }}>
          {listItems.map((item, j) => (
            <View key={j} style={{ flexDirection: "row", marginVertical: 1 }}>
              <Text style={{ color: c.fgSub, fontSize, width: 20, textAlign: "right", marginRight: 4 }}>{item.num}.</Text>
              <View style={{ flex: 1 }}>
                <InlineContent text={item.text} fontSize={fontSize} />
              </View>
            </View>
          ))}
        </View>
      )
      continue
    }

    // Regular paragraph
    elements.push(
      <View key={key++} style={{ marginVertical: 1 }}>
        <InlineContent text={line} fontSize={fontSize} />
      </View>
    )
    i++
  }

  return <View>{elements}</View>
}
