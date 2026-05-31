import { View, Text, TextInput, TouchableOpacity } from "react-native"
import { c } from "@/theme"

// `c.accent` is not defined in theme.ts (pre-existing bug, see agents README) —
// preserved verbatim from source via a typed cast.
const accent = (c as Record<string, string>).accent

export function ServerEditForm({
  name, setName, url, setUrl, token, setToken,
  error, loading, onCancel, onSave,
}: {
  name: string
  setName: (v: string) => void
  url: string
  setUrl: (v: string) => void
  token: string
  setToken: (v: string) => void
  error: string | null
  loading: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: accent, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={c.placeholder}
        style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 14, marginBottom: 8 }}
      />
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.x:4321"
        placeholderTextColor={c.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 8 }}
      />
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder="Auth token"
        placeholderTextColor={c.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 12 }}
      />
      {error && (
        <Text style={{ color: c.error, fontSize: 12, marginBottom: 8, marginTop: -4 }}>{error}</Text>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.secondary, alignItems: "center" }}
        >
          <Text style={{ color: c.fgSub, fontWeight: "500" }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          disabled={loading}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: accent, alignItems: "center", opacity: loading ? 0.6 : 1 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>{loading ? "Verifying…" : "Save"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
