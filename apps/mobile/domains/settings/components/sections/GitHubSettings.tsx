import { useState } from "react"
import { View, Text, ActivityIndicator } from "react-native"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"
import { SettingsCard } from "../SettingsRow"
import { PrimaryButton } from "../FormField"

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.fgSub, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.fg, fontSize: 13, flexShrink: 1, textAlign: "right" }} numberOfLines={2}>{value}</Text>
    </View>
  )
}

/** Read-only GitHub connection status for the active server, with a re-check button. */
export function GitHubSettings() {
  const queryClient = useQueryClient()
  const [testing, setTesting] = useState(false)
  const { data: status, isLoading } = useHuxfluxQuery({
    queryKey: queryKeys.settings.githubStatus(),
    queryFn: () => api.settings.githubStatus(),
    staleTime: 60_000,
  })

  async function testConnection() {
    setTesting(true)
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.githubStatus() })
    setTesting(false)
  }

  if (isLoading || !status) return <ActivityIndicator color={c.accent} style={{ marginTop: 32 }} />

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 16 }}>
        GitHub access is configured on the server via GITHUB_TOKEN, or taken from the gh CLI when it is authenticated.
        PR reviews, diffs and CI checks need a token with repo scope.
      </Text>
      <SettingsCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status.connected ? c.success : c.error }} />
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600" }}>{status.connected ? "Connected" : "Not connected"}</Text>
        </View>
        {status.login && <Line label="Account" value={status.name ? `${status.name} (@${status.login})` : `@${status.login}`} />}
        {status.scopes.length > 0 && <Line label="Scopes" value={status.scopes.join(", ")} />}
        {status.rateLimitRemaining !== null && status.rateLimitTotal !== null && (
          <Line label="Rate limit" value={`${status.rateLimitRemaining} / ${status.rateLimitTotal} remaining`} />
        )}
        {status.error && <Line label="Error" value={status.error} />}
        <View style={{ paddingVertical: 12 }}>
          <PrimaryButton label={testing ? "Checking…" : "Test connection"} onPress={testConnection} loading={testing} />
        </View>
      </SettingsCard>
    </View>
  )
}
