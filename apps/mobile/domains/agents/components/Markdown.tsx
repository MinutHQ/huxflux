import { View, Text, ScrollView, Linking } from "react-native"
import { c } from "@/theme"

interface MarkdownProps {
  content: string
  fontSize?: number
}

function InlineContent({ text, fontSize }: { text: string; fontSize: number }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  // First pass: strip HTML and convert to pseudo-markdown, then parse
  // Actually, let's handle it inline
  const processed = text
    // Convert HTML tags to markdown equivalents
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(b|strong)>/gi, "**").replace(/<\/(b|strong)>/gi, "**")
    .replace(/<(i|em)>/gi, "*").replace(/<\/(i|em)>/gi, "*")
    .replace(/<(del|s)>/gi, "~~").replace(/<\/(del|s)>/gi, "~~")
    .replace(/<code>/gi, "`").replace(/<\/code>/gi, "`")
    .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img\s+[^>]*alt="([^"]*)"[^>]*\/?>/gi, "[$1]")
    .replace(/<img\s+[^>]*src="([^"]*)"[^>]*\/?>/gi, "[image]($1)")
    // Strip remaining HTML tags
    .replace(/<\/?[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")

  const inlineRegex = /(`[^`]+`)|((\*\*|__)([\s\S]*?)\3)|((\*|_)([\s\S]*?)\6)|(~~([\s\S]*?)~~)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<)\]]+)/g

  while ((match = inlineRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={key++} style={{ color: c.fg, fontSize, lineHeight: fontSize * 1.5 }}>{processed.slice(lastIndex, match.index)}</Text>)
    }

    if (match[1]) {
      // Inline code
      parts.push(
        <Text key={key++} style={{ fontFamily: "monospace", fontSize: fontSize - 1, color: c.fgBright, backgroundColor: c.secondary }}>
          {match[1].slice(1, -1)}
        </Text>
      )
    } else if (match[2]) {
      // Bold
      parts.push(<Text key={key++} style={{ color: c.fg, fontSize, fontWeight: "700", lineHeight: fontSize * 1.5 }}>{match[4]}</Text>)
    } else if (match[5]) {
      // Italic
      parts.push(<Text key={key++} style={{ color: c.fg, fontSize, fontStyle: "italic", lineHeight: fontSize * 1.5 }}>{match[7]}</Text>)
    } else if (match[8]) {
      // Strikethrough
      parts.push(<Text key={key++} style={{ color: c.fgSub, fontSize, textDecorationLine: "line-through", lineHeight: fontSize * 1.5 }}>{match[9]}</Text>)
    } else if (match[10]) {
      // Link [text](url)
      const url = match[12]
      parts.push(
        <Text key={key++} style={{ color: c.link, fontSize, lineHeight: fontSize * 1.5 }} onPress={() => Linking.openURL(url)}>
          {match[11]}
        </Text>
      )
    } else if (match[13]) {
      // Bare URL
      const url = match[13]
      parts.push(
        <Text key={key++} style={{ color: c.link, fontSize, lineHeight: fontSize * 1.5 }} onPress={() => Linking.openURL(url)}>
          {url}
        </Text>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < processed.length) {
    parts.push(<Text key={key++} style={{ color: c.fg, fontSize, lineHeight: fontSize * 1.5 }}>{processed.slice(lastIndex)}</Text>)
  }

  if (parts.length === 0) {
    return <Text style={{ color: c.fg, fontSize, lineHeight: fontSize * 1.5 }}>{processed}</Text>
  }

  return <Text>{parts}</Text>
}

// ── Table rendering ─────────────────────────────────────────────────────────

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line.trim())
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

function TableView({ headerRow, rows, fontSize }: { headerRow: string[]; rows: string[][]; fontSize: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, overflow: "hidden" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", backgroundColor: c.secondary }}>
          {headerRow.map((cell, i) => (
            <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 6, minWidth: 80, borderRightWidth: i < headerRow.length - 1 ? 1 : 0, borderRightColor: c.border }}>
              <Text style={{ color: c.fgBright, fontSize: fontSize - 1, fontWeight: "700" }}>{cell}</Text>
            </View>
          ))}
        </View>
        {/* Rows */}
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border }}>
            {row.map((cell, ci) => (
              <View key={ci} style={{ paddingHorizontal: 10, paddingVertical: 5, minWidth: 80, borderRightWidth: ci < row.length - 1 ? 1 : 0, borderRightColor: c.border }}>
                <InlineContent text={cell} fontSize={fontSize - 1} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

// ── Preprocess HTML blocks ──────────────────────────────────────────────────

function preprocessContent(content: string): string {
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
