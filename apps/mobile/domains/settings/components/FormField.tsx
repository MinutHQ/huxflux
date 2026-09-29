import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, type TextInputProps } from "react-native"
import { c } from "@/theme"

// Small form primitives shared by the add-repo, clone, quick-start and
// repo-settings screens. Styling mirrors the servers-domain forms.

export function FieldLabel({ label, loading, hint }: { label: string; loading?: boolean; hint?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {loading && <ActivityIndicator size="small" color={c.fgSub} />}
      {hint ? <Text style={{ color: c.placeholder, fontSize: 11 }}>{hint}</Text> : null}
    </View>
  )
}

export function TextField({
  label, mono, loading, hint, multiline, style, ...inputProps
}: { label: string; mono?: boolean; loading?: boolean; hint?: string } & TextInputProps) {
  return (
    <View>
      <FieldLabel label={label} loading={loading} hint={hint} />
      <TextInput
        placeholderTextColor={c.placeholder}
        autoCapitalize={mono ? "none" : inputProps.autoCapitalize}
        autoCorrect={mono ? false : inputProps.autoCorrect}
        multiline={multiline}
        style={[
          {
            backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10,
            color: c.fg, fontSize: mono ? 13 : 14, padding: 12,
            fontFamily: mono ? "monospace" : undefined,
          },
          multiline ? { minHeight: 90, textAlignVertical: "top", lineHeight: 18 } : null,
          style,
        ]}
        {...inputProps}
      />
    </View>
  )
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <FieldLabel label={label} />
      <View style={{ backgroundColor: c.secondary, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12 }}>
        <Text style={{ color: c.fgSub, fontSize: 12, fontFamily: "monospace" }} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null
  return <Text style={{ color: c.error, fontSize: 12 }}>{message}</Text>
}

export function PrimaryButton({
  label, onPress, disabled, loading, destructive,
}: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; destructive?: boolean }) {
  const inactive = disabled || loading
  const bg = destructive ? c.error : c.accent
  const fg = destructive ? "#fff" : c.accentFg
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      style={{ backgroundColor: inactive ? c.secondary : bg, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
    >
      {loading
        ? <ActivityIndicator color={c.fgSub} />
        : <Text style={{ color: inactive ? c.fgSub : fg, fontSize: 15, fontWeight: "600" }}>{label}</Text>}
    </TouchableOpacity>
  )
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8}>
      <Text style={{ color: c.link, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  )
}

export function SegmentedControl<T extends string>({
  options, value, onChange,
}: { options: { id: T; label: string }[]; value: T; onChange: (next: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.secondary, borderRadius: 10, padding: 3 }}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onChange(o.id)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: active ? c.card : "transparent" }}
          >
            <Text style={{ color: active ? c.fg : c.fgSub, fontSize: 13, fontWeight: "500" }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
