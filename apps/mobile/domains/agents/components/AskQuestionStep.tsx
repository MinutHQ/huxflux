import { View, Text, TextInput, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { AskQuestionEntry } from "@huxflux/shared"
import { c } from "@/theme"
import type { QuestionDraft } from "@huxflux/shared"

function OptionRow({ label, description, chosen, multi, onPress }: {
  label: string
  description?: string
  chosen: boolean
  multi: boolean
  onPress: () => void
}) {
  const icon = multi
    ? (chosen ? "checkbox" : "square-outline")
    : (chosen ? "radio-button-on" : "radio-button-off")
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "flex-start", gap: 10,
        paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
        borderColor: chosen ? c.fgBright : c.border,
        backgroundColor: chosen ? c.secondary : "transparent",
      }}
    >
      <Ionicons name={icon} size={16} color={chosen ? c.fgBright : c.fgSub} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {!!description && <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{description}</Text>}
      </View>
    </TouchableOpacity>
  )
}

/** One question of an AskUserQuestion: its options, an "Other" input, and the chosen option's preview. */
export function AskQuestionStep({ question, draft, onToggle, onOtherChange, disabled }: {
  question: AskQuestionEntry
  draft: QuestionDraft
  onToggle: (label: string) => void
  onOtherChange: (text: string) => void
  disabled: boolean
}) {
  const options = question.options ?? []
  const multi = !!question.multiSelect
  const previewOption = multi ? undefined : options.find((o) => o.label === draft.selected[0])
  const preview = previewOption?.preview

  return (
    <View style={{ gap: 8 }} pointerEvents={disabled ? "none" : "auto"}>
      {!!question.header && (
        <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>{question.header}</Text>
      )}
      <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{question.question}</Text>
      {multi && <Text style={{ color: c.fgSub, fontSize: 11 }}>Choose all that apply</Text>}

      {options.map((o) => (
        <OptionRow
          key={o.label}
          label={o.label}
          description={o.description}
          chosen={draft.selected.includes(o.label)}
          multi={multi}
          onPress={() => onToggle(o.label)}
        />
      ))}

      {!!preview && (
        <View style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10 }}>
          <Text style={{ color: c.fg, fontSize: 12, fontFamily: "monospace" }}>{preview}</Text>
        </View>
      )}

      <TextInput
        value={draft.other}
        onChangeText={onOtherChange}
        placeholder={options.length > 0 ? "Other…" : "Your answer…"}
        placeholderTextColor={c.placeholder}
        editable={!disabled}
        multiline
        style={{
          color: c.fg, fontSize: 14, lineHeight: 20, maxHeight: 100,
          paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
          borderColor: draft.other.trim() ? c.fgBright : c.border, backgroundColor: c.bg,
        }}
      />
    </View>
  )
}
