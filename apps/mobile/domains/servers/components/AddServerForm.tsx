import { View, Text, TextInput, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { c } from "@/theme"

// `c.accent` is not defined in theme.ts (pre-existing bug, see agents README) —
// preserved verbatim from source via a typed cast.
const accent = (c as Record<string, string>).accent

export function AddServerForm({
  name, setName, input, setInput, token, setToken,
  error, loading, onCancel, onAdd,
}: {
  name: string
  setName: (v: string) => void
  input: string
  setInput: (v: string) => void
  token: string
  setToken: (v: string) => void
  error: string | null
  loading: boolean
  onCancel: () => void
  onAdd: () => void
}) {
  const disabled = loading || !input.trim() || !token.trim()
  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginTop: 8 }}>
      <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Add Server</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name (optional)"
        placeholderTextColor={c.placeholder}
        style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 14, marginBottom: 8 }}
      />
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="http://192.168.1.x:4321 or huxflux://..."
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
        <Text style={{ color: c.error, fontSize: 12, marginBottom: 10, marginTop: -4 }}>{error}</Text>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.secondary, alignItems: "center" }}
        >
          <Text style={{ color: c.fgSub, fontWeight: "500" }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onAdd}
          disabled={disabled}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: accent, alignItems: "center", opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>{loading ? "Verifying…" : "Add"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export function AddServerButtons({ onAdd, onScan }: { onAdd: () => void; onScan: () => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
      <TouchableOpacity
        onPress={onAdd}
        style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderStyle: "dashed", borderRadius: 12, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: c.fgSub, fontSize: 14 }}>+ Add Server</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onScan}
        style={{ borderWidth: 1, borderColor: c.border, borderStyle: "dashed", borderRadius: 12, padding: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="qr-code-outline" size={20} color={c.fgSub} />
      </TouchableOpacity>
    </View>
  )
}
