import { useState } from "react"
import { View, Text } from "react-native"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { c } from "@/theme"
import { PrimaryButton } from "../FormField"
import { SchemaSection } from "../server-settings/SchemaSection"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

interface JiraStatus { ok: boolean; method?: string; displayName?: string; error?: string }

/** Jira credentials (from the schema) plus a connection test. */
export function IntegrationsSettings({ state }: { state: ServerSettingsState }) {
  const [result, setResult] = useState<JiraStatus | null>(null)
  const test = useHuxfluxMutation<JiraStatus, void>({
    mutationFn: () => api.tasks.jiraStatus(),
    onSuccess: setResult,
    onError: (e) => setResult({ ok: false, error: e instanceof Error ? e.message : "Connection failed" }),
  })

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 16 }}>
        Connect to Jira Cloud to sync tasks. Create an API token at id.atlassian.com. Fields save when you leave them.
        Without credentials the server falls back to the acli CLI.
      </Text>
      <SchemaSection section="integrations" state={state} />
      <PrimaryButton
        label={test.isPending ? "Testing…" : "Test connection"}
        onPress={() => { setResult(null); test.mutate() }}
        loading={test.isPending}
        disabled={state.saving}
      />
      {result && (
        <Text style={{ color: result.ok ? c.success : c.error, fontSize: 13 }}>
          {result.ok
            ? `Connected${result.displayName ? ` as ${result.displayName}` : ""}${result.method ? ` via ${result.method}` : ""}`
            : result.error ?? "Connection failed"}
        </Text>
      )}
    </View>
  )
}
