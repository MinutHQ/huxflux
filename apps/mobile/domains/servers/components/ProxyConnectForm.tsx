import { useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { c } from "@/theme"
import { useProxyConnect } from "../hooks/useProxyConnect"

/**
 * Add-via-proxy flow: enter the proxy base URL, sign in with Google in
 * Safari, then pick one of the servers registered to that account.
 */
export function ProxyConnectForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("")
  const { step, loading, error, token, servers, signIn, cancelSignIn, select, clearError } = useProxyConnect(onDone)

  return (
    <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginTop: 8 }}>
      <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Add Server via Proxy</Text>

      {step === "url" ? (
        <>
          <TextInput
            value={url}
            onChangeText={(v) => { setUrl(v); clearError() }}
            placeholder="https://proxy.example.com"
            placeholderTextColor={c.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: c.fg, fontSize: 13, fontFamily: "monospace", marginBottom: 8 }}
          />
          <Text style={{ color: c.fgSub, fontSize: 12, marginBottom: 12 }}>
            {loading
              ? "Finish signing in in Safari, then switch back to Huxflux."
              : "You'll sign in with your account in Safari, then pick a server."}
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: c.fgSub, fontSize: 12, marginBottom: 8 }}>
            Signed in{token?.email ? ` as ${token.email}` : ""}. Choose a server:
          </Text>
          {servers.length === 0 && (
            <Text style={{ color: c.fgSub, fontSize: 13, marginBottom: 12 }}>
              No servers are currently connected to this proxy for your account.
            </Text>
          )}
          {servers.map((s) => (
            <TouchableOpacity
              key={s.serverId}
              onPress={() => select(s)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 }}
            >
              <Ionicons name="server-outline" size={14} color={c.fgSub} />
              <Text style={{ color: c.fg, fontSize: 14, flex: 1 }} numberOfLines={1}>{s.name}</Text>
              {s.version && <Text style={{ color: c.fgSub, fontSize: 11 }}>v{s.version}</Text>}
            </TouchableOpacity>
          ))}
        </>
      )}

      {error && <Text style={{ color: c.error, fontSize: 12, marginBottom: 10 }}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={() => { cancelSignIn(); onDone() }}
          style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: c.secondary, alignItems: "center" }}
        >
          <Text style={{ color: c.fgSub, fontWeight: "500" }}>Cancel</Text>
        </TouchableOpacity>
        {step === "url" && (
          <TouchableOpacity
            onPress={() => void signIn(url)}
            disabled={loading || !url.trim()}
            style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", opacity: loading || !url.trim() ? 0.5 : 1 }}
          >
            {loading && <ActivityIndicator size="small" color={c.accentFg} />}
            <Text style={{ color: c.accentFg, fontWeight: "600" }}>{loading ? "Waiting…" : "Sign in"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
