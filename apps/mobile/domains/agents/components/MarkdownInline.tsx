import { Text, Linking } from "react-native"
import { c } from "@/theme"
import { mapOutsideCode } from "./markdownText"

// Links come from agent output, so only open web and mail links.
function openLink(url: string) {
  if (!/^(https?:|mailto:)/i.test(url)) return
  Linking.openURL(url).catch((err: unknown) => console.warn("Could not open link", url, err))
}

// Bold, italic and strikethrough need a non-space just inside the markers, and
// `_`/`*` must not touch a word character outside them, so names like
// snake_case_file.ts and maths like 2 * 3 * 4 stay plain text.
// Groups: 1 code, 2 bold, 3 italic, 4 strike, 5 link (6 text, 7 url), 8 bare url.
const inlinePattern = [
  "(`[^`]+`)",
  "((?<![\\w*])\\*\\*(?!\\s)[^\\n]+?(?<!\\s)\\*\\*(?![\\w*])|(?<!\\w)__(?!\\s)[^\\n]+?(?<!\\s)__(?!\\w))",
  "((?<![\\w*])\\*(?![\\s*])[^*\\n]+?(?<![\\s*])\\*(?![\\w*])|(?<!\\w)_(?![\\s_])[^_\\n]+?(?<![\\s_])_(?!\\w))",
  "(~~(?!\\s)[^\\n]+?(?<!\\s)~~)",
  "(\\[([^\\]]+)\\]\\(([^)\\s]+)\\))",
  "(https?:\\/\\/[^\\s<)\\]]+)",
].join("|")

export function InlineContent({ text, fontSize }: { text: string; fontSize: number }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  const processed = mapOutsideCode(text, (s) => s
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
    .replace(/&nbsp;/g, " "))
  const inlineRegex = new RegExp(inlinePattern, "g")

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
      parts.push(<Text key={key++} style={{ color: c.fg, fontSize, fontWeight: "700", lineHeight: fontSize * 1.5 }}>{match[2].slice(2, -2)}</Text>)
    } else if (match[3]) {
      // Italic
      parts.push(<Text key={key++} style={{ color: c.fg, fontSize, fontStyle: "italic", lineHeight: fontSize * 1.5 }}>{match[3].slice(1, -1)}</Text>)
    } else if (match[4]) {
      // Strikethrough
      parts.push(<Text key={key++} style={{ color: c.fgSub, fontSize, textDecorationLine: "line-through", lineHeight: fontSize * 1.5 }}>{match[4].slice(2, -2)}</Text>)
    } else if (match[5]) {
      // Link [text](url)
      const url = match[7]
      parts.push(
        <Text key={key++} style={{ color: c.link, fontSize, lineHeight: fontSize * 1.5 }} onPress={() => openLink(url)}>
          {match[6]}
        </Text>
      )
    } else if (match[8]) {
      // Bare URL
      const url = match[8]
      parts.push(
        <Text key={key++} style={{ color: c.link, fontSize, lineHeight: fontSize * 1.5 }} onPress={() => openLink(url)}>
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

