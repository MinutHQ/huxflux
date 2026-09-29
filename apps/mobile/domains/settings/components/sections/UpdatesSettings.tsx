import { View, Text } from "react-native"
import { api, queryKeys, useHuxfluxMutation, useHuxfluxQuery, type ServerVersionInfo } from "@huxflux/shared"
import { useQueryClient } from "@tanstack/react-query"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { SectionLabel, SettingsCard } from "../SettingsRow"
import { PrimaryButton, LinkButton } from "../FormField"
import { SchemaSection } from "../server-settings/SchemaSection"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

function ServerVersionCard() {
  const modal = useModal()
  const queryClient = useQueryClient()
  const key = queryKeys.settings.serverVersion()
  const { data: info } = useHuxfluxQuery({ queryKey: key, queryFn: () => api.settings.serverVersion(), staleTime: 60_000 })

  const check = useHuxfluxMutation<ServerVersionInfo, void>({
    mutationFn: () => api.settings.checkUpdate(),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next)
      if (!next.updateAvailable) modal.showAlert("Up to date", `Server is on ${next.current}.`)
    },
    onError: () => modal.showAlert("Check failed", "Could not check for server updates."),
  })

  const update = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.settings.triggerUpdate(),
    onSuccess: () => modal.showAlert("Server updating", "The server will restart with the new version."),
    onError: () => modal.showAlert("Update failed", "The server could not update itself."),
  })

  const busy = check.isPending || update.isPending

  return (
    <View>
      <SectionLabel label="Server" />
      <SettingsCard>
        <View style={{ paddingVertical: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: c.fg, fontSize: 14, fontFamily: "monospace" }}>{info?.current ?? "…"}</Text>
              {info?.updateAvailable && info.latest && (
                <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{info.latest} available</Text>
              )}
            </View>
            <LinkButton label={check.isPending ? "Checking…" : "Check for updates"} onPress={() => { if (!busy) check.mutate() }} />
          </View>
          {info?.updateAvailable && (
            <PrimaryButton label={update.isPending ? "Updating…" : `Update to ${info.latest}`} onPress={() => update.mutate()} loading={update.isPending} disabled={busy} />
          )}
        </View>
      </SettingsCard>
    </View>
  )
}

/** Update channel + auto-update toggle from the schema, plus the server version block. */
export function UpdatesSettings({ state }: { state: ServerSettingsState }) {
  return (
    <View style={{ gap: 20 }}>
      <SchemaSection section="updates" state={state} />
      <ServerVersionCard />
    </View>
  )
}
