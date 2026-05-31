import { View, Text, Linking } from "react-native"
import { c } from "@/theme"
import { stripSycophancy } from "../utils"

// ── Inline text (code, bold, italic, links) ──────────────────────────────────

export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s)>\]"]+)/g)
  return (
    <Text style={{ color: c.fgBright, fontSize: 14, lineHeight: 21 }}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <Text key={i} style={{ color: c.fgSub, fontSize: 13 }}>`{part.slice(1, -1)}`</Text>
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>
        }
        if (part.startsWith("http://") || part.startsWith("https://")) {
          return <Text key={i} style={{ color: "#60a5fa", textDecorationLine: "underline" }} onPress={() => Linking.openURL(part)}>{part}</Text>
        }
        return <Text key={i}>{part}</Text>
      })}
    </Text>
  )
}

// ── Block-level parsing ──────────────────────────────────────────────────────

function renderSegment(seg: string, segIdx: number): React.ReactNode {
  if (seg.startsWith("```")) {
    const firstNewline = seg.indexOf("\n")
    const lang = firstNewline > 3 ? seg.slice(3, firstNewline).trim() : ""
    const code = firstNewline > 0 ? seg.slice(firstNewline + 1, -3) : seg.slice(3, -3)
    return (
      <View key={segIdx} style={{ backgroundColor: c.card, borderRadius: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        {lang ? (
          <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }}>
            <Text style={{ color: c.fgSub, fontSize: 10, fontFamily: "monospace" }}>{lang}</Text>
          </View>
        ) : null}
        <Text style={{ color: c.fgBright, fontSize: 12, fontFamily: "monospace", lineHeight: 19, padding: 12 }}>
          {code.replace(/\n$/, "")}
        </Text>
      </View>
    )
  }

  const lines = seg.split("\n")
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let listOrdered = false
  let paraLines: string[] = []

  function flushList() {
    if (listItems.length === 0) return
    const items = listItems
    const ordered = listOrdered
    elements.push(
      <View key={`list-${elements.length}`} style={{ gap: 2, paddingLeft: 4 }}>
        {items.map((item, li) => (
          <View key={li} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
            <Text style={{ color: c.fgSub, fontSize: 14, lineHeight: 21, minWidth: 14 }}>
              {ordered ? `${li + 1}.` : "•"}
            </Text>
            <InlineText text={item} />
          </View>
        ))}
      </View>
    )
    listItems = []
  }

  function flushPara() {
    if (paraLines.length === 0) return
    const text = paraLines.map((l) => l.trim()).join(" ")
    elements.push(<InlineText key={`p-${elements.length}`} text={text} />)
    paraLines = []
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line.trim()) {
      flushPara()
      flushList()
      continue
    }
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    const ul = line.match(/^[-*] (.+)/)
    const ol = line.match(/^\d+\. (.+)/)
    const blockquote = line.match(/^> (.+)/)
    const hr = line.match(/^---+$/)
    if (h1) {
      flushPara(); flushList()
      elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 18, fontWeight: "700", lineHeight: 26, marginTop: 4 }}>{h1[1]}</Text>)
    } else if (h2) {
      flushPara(); flushList()
      elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 4 }}>{h2[1]}</Text>)
    } else if (h3) {
      flushPara(); flushList()
      elements.push(<Text key={li} style={{ color: c.fgBright, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>{h3[1]}</Text>)
    } else if (ul) {
      flushPara()
      if (listOrdered) { flushList(); listOrdered = false }
      listItems.push(ul[1])
    } else if (ol) {
      flushPara()
      if (!listOrdered) { flushList(); listOrdered = true }
      listItems.push(ol[1])
    } else if (blockquote) {
      flushPara(); flushList()
      elements.push(
        <View key={li} style={{ borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, opacity: 0.7 }}>
          <InlineText text={blockquote[1]} />
        </View>
      )
    } else if (hr) {
      flushPara(); flushList()
      elements.push(<View key={li} style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />)
    } else {
      flushList()
      paraLines.push(line)
    }
  }
  flushPara()
  flushList()
  return elements.length > 0 ? <View key={segIdx} style={{ gap: 6 }}>{elements}</View> : null
}

// ── Main message content renderer ────────────────────────────────────────────

export function MessageContent({ text }: { text: string }) {
  const processed = stripSycophancy(text)
  const segments = processed.split(/(```[\s\S]*?```)/g)
  return (
    <View style={{ gap: 4 }}>
      {segments.map((seg, i) => renderSegment(seg, i))}
    </View>
  )
}
