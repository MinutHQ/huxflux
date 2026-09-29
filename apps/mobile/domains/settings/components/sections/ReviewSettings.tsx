import { useEffect, useRef, useState } from "react"
import { View, Text } from "react-native"
import { api, queryKeys, settingsSchema, useHuxfluxQuery } from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { SettingsCard, SettingsNavRow } from "../SettingsRow"
import { TextField } from "../FormField"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

const SAVE_DELAY_MS = 800

function ReviewPromptField({ state }: { state: ServerSettingsState }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef<string | null>(null)
  const def = settingsSchema.reviewPrompt
  const value = draft ?? state.settings.reviewPrompt

  // Flush a pending save on unmount rather than losing the last edit.
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (draftRef.current !== null) state.update({ reviewPrompt: draftRef.current })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(text: string) {
    setDraft(text)
    draftRef.current = text
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      draftRef.current = null
      state.update({ reviewPrompt: text })
      setSaved(true)
    }, SAVE_DELAY_MS)
  }

  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: -18 }}>
        <Text style={{ color: c.fgSub, fontSize: 11, opacity: saved ? 1 : 0 }}>Saved</Text>
      </View>
      <TextField
        label={def.label}
        hint={def.description}
        multiline
        value={value}
        onChangeText={handleChange}
        placeholder="e.g. Focus on security and performance issues…"
        editable={state.loaded}
      />
    </View>
  )
}

/** Review prompt plus provider / model choice for AI code reviews. Mirrors the web section. */
export function ReviewSettings({ state }: { state: ServerSettingsState }) {
  const modal = useModal()
  const { data: providers = [] } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: () => api.settings.providers(),
    staleTime: 60_000,
  })

  const available = providers.filter((p) => p.available)
  const { reviewProvider, reviewModel } = state.settings
  const selectedProvider = available.find((p) => p.id === reviewProvider) ?? available[0]
  const models = selectedProvider?.models ?? []
  const providerLabel = available.find((p) => p.id === reviewProvider)?.name ?? "Default"
  const modelLabel = models.find((m) => m.id === reviewModel)?.label ?? (reviewModel || "Default")

  function pickProvider() {
    modal.showActionSheet("Review provider", [
      { label: "Default", onPress: () => state.update({ reviewProvider: "", reviewModel: "" }) },
      ...available.map((p) => ({ label: p.name, onPress: () => state.update({ reviewProvider: p.id, reviewModel: "" }) })),
    ])
  }

  function pickModel() {
    modal.showActionSheet("Review model", [
      { label: "Default", onPress: () => state.update({ reviewModel: "" }) },
      ...models.map((m) => ({ label: m.label, onPress: () => state.update({ reviewModel: m.id }) })),
    ])
  }

  return (
    <SettingsCard>
      <ReviewPromptField state={state} />
      <SettingsNavRow
        label={settingsSchema.reviewProvider.label}
        description={settingsSchema.reviewProvider.description}
        value={providerLabel}
        onPress={pickProvider}
      />
      <SettingsNavRow
        label={settingsSchema.reviewModel.label}
        description={settingsSchema.reviewModel.description}
        value={modelLabel}
        onPress={pickModel}
        last
      />
    </SettingsCard>
  )
}
