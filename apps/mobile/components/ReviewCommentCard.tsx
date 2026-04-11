import { View, Text, TouchableOpacity, ScrollView } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { tokenize } from "@huxflux/shared"
import { c } from "../theme"
import { Markdown } from "./Markdown"

export interface CodeLine {
  lineNumber: number
  content: string
  highlighted?: boolean
}

export interface ReviewComment {
  id: string
  type: "inline" | "general"
  severity: "blocking" | "suggestion" | "nit"
  path?: string
  line?: number
  codeContext?: CodeLine[]
  body: string
  status: "pending" | "queued" | "dismissed" | "sent"
}

const TOKEN_COLOR: Record<string, string> = {
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

const SEVERITY_CONFIG = {
  blocking:   { label: "Blocking",   bg: "rgba(239,68,68,0.15)",   border: "#ef4444", text: "#ef4444" },
  suggestion: { label: "Suggestion", bg: "rgba(245,158,11,0.15)",  border: "#f59e0b", text: "#f59e0b" },
  nit:        { label: "Nit",        bg: "rgba(148,163,184,0.15)", border: "#94a3b8", text: "#94a3b8" },
}

export function ReviewCommentCard({
  comment,
  onDismiss,
  onQueue,
  isQueued,
}: {
  comment: ReviewComment
  onDismiss: (id: string) => void
  onQueue: (comment: ReviewComment) => void
  isQueued: boolean
}) {
  const sev = SEVERITY_CONFIG[comment.severity]
  const isDismissed = comment.status === "dismissed"

  return (
    <View style={{
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 3,
      borderLeftColor: sev.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      opacity: isDismissed ? 0.5 : 1,
    }}>
      {/* Header: severity + file location */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <View style={{ backgroundColor: sev.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          <Text style={{ color: sev.text, fontSize: 10, fontWeight: "700" }}>{sev.label}</Text>
        </View>
        {comment.path && (
          <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace", flex: 1 }} numberOfLines={1}>
            {comment.path.split("/").pop()}{comment.line ? `:${comment.line}` : ""}
          </Text>
        )}
      </View>

      {/* Code context */}
      {comment.codeContext && comment.codeContext.length > 0 && (
        <View style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
          {comment.codeContext.map((line, i) => (
            <View key={i} style={{
              flexDirection: "row",
              backgroundColor: line.highlighted ? "rgba(250,204,21,0.1)" : "transparent",
              minHeight: 20,
            }}>
              <Text style={{
                color: line.highlighted ? c.warning : c.placeholder,
                fontSize: 10, fontFamily: "monospace",
                width: 32, textAlign: "right", paddingRight: 6, paddingTop: 2,
                opacity: 0.7,
              }}>
                {line.lineNumber}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <Text style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 18, paddingTop: 1, paddingRight: 12 }}>
                  {tokenize(line.content).map((tok, j) => (
                    <Text key={j} style={{ color: TOKEN_COLOR[tok.cls] ?? c.fgBright }}>{tok.text}</Text>
                  ))}
                </Text>
              </ScrollView>
            </View>
          ))}
        </View>
      )}

      {/* Body */}
      <Markdown content={comment.body} />

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => onDismiss(comment.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name={isDismissed ? "eye-outline" : "eye-off-outline"} size={14} color={c.fgSub} />
          <Text style={{ color: c.fgSub, fontSize: 12 }}>{isDismissed ? "Restore" : "Dismiss"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onQueue(comment)}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons name={isQueued ? "checkmark-circle" : "arrow-up-circle-outline"} size={14} color={isQueued ? c.success : c.fgSub} />
          <Text style={{ color: isQueued ? c.success : c.fgSub, fontSize: 12 }}>{isQueued ? "Queued" : "Queue"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
