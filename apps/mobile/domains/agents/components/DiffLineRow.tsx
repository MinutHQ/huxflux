import { View, Text, ScrollView } from "react-native"
import { tokenize, type DiffLine } from "@huxflux/shared"
import { c } from "@/theme"

// Syntax token class → color
export const TOKEN_COLOR: Record<string, string> = {
  comment:     c.fgSub,
  string:      c.warning,
  template:    "#7dd3fc",
  keyword:     "#a78bfa",
  type:        "#7dd3fc",
  constructor: "#2dd4bf",
  number:      "#fb923c",
  punctuation: c.fgSub,
  identifier:  c.fgBright,
  whitespace:  "transparent",
  other:       c.fgSub,
}

export function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdd  = line.type === "add"
  const isDel  = line.type === "del"
  const isHunk = line.type === "hunk"

  if (isHunk) {
    return (
      <View style={{ backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 3 }}>
        <Text style={{ color: c.link, fontSize: 11, fontFamily: "monospace", opacity: 0.7 }}>{line.text}</Text>
      </View>
    )
  }

  const bgColor   = isAdd ? c.addBg : isDel ? c.delBg : "transparent"
  const signColor = isAdd ? c.success : isDel ? c.error : "transparent"
  const sign      = isAdd ? "+" : isDel ? "−" : " "
  const tokens    = tokenize(line.text)

  return (
    <View style={{ flexDirection: "row", backgroundColor: bgColor, minHeight: 22 }}>
      <Text style={{ color: isAdd ? c.success : isDel ? c.error : c.placeholder, fontSize: 10, fontFamily: "monospace", width: 36, textAlign: "right", paddingRight: 6, paddingTop: 3, flexShrink: 0, opacity: 0.7 }}>
        {line.lineNo ?? ""}
      </Text>
      <Text style={{ color: signColor, fontSize: 12, fontFamily: "monospace", width: 14, paddingTop: 3, flexShrink: 0 }}>
        {sign}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 20, paddingTop: 2, paddingRight: 16 }}>
          {tokens.map((tok, i) => (
            <Text key={i} style={{ color: TOKEN_COLOR[tok.cls] ?? c.fgBright }}>{tok.text}</Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  )
}
