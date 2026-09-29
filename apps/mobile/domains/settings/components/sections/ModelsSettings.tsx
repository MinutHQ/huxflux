import { useMemo, useState } from "react"
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, queryKeys, useHuxfluxQuery, type ProviderInfo, type SharedProviderModel as ProviderModel } from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { SectionLabel, SettingsCard } from "../SettingsRow"
import { LinkButton } from "../FormField"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

// Same key format the web settings page stores in `hiddenModels`.
function modelKey(providerId: string, model: ProviderModel): string {
  return `${providerId}:${model.api || model.id}`
}

function ModelRow({ model, hidden, isDefault, last, onPress }: {
  model: ProviderModel; hidden: boolean; isDefault: boolean; last: boolean; onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border, opacity: hidden ? 0.45 : 1 }}
    >
      <Ionicons name={hidden ? "eye-off-outline" : "eye-outline"} size={16} color={c.fgSub} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.fg, fontSize: 14 }}>{model.label}</Text>
        <Text style={{ color: c.fgSub, fontSize: 11, fontFamily: "monospace" }} numberOfLines={1}>{model.api || model.id}</Text>
      </View>
      {isDefault && (
        <View style={{ backgroundColor: c.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: c.fg, fontSize: 11, fontWeight: "600" }}>Default</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function ProviderCard({ provider, state }: { provider: ProviderInfo; state: ServerSettingsState }) {
  const modal = useModal()
  const hidden = state.settings.hiddenModels
  const isDefaultProvider = state.settings.defaultProvider === provider.id

  function setVisible(models: ProviderModel[], visible: boolean) {
    const keys = new Set(models.map((m) => modelKey(provider.id, m)))
    const rest = hidden.filter((k) => !keys.has(k))
    state.update({ hiddenModels: visible ? rest : [...rest, ...keys] })
  }

  function openModelMenu(model: ProviderModel) {
    const key = modelKey(provider.id, model)
    const isHidden = hidden.includes(key)
    modal.showActionSheet(model.label, [
      { label: "Set as default for new agents", onPress: () => state.update({ defaultProvider: provider.id, defaultModel: model.id }) },
      { label: isHidden ? "Show in model switcher" : "Hide from model switcher", onPress: () => setVisible([model], isHidden) },
    ])
  }

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel label={`${provider.name}${provider.available ? "" : " (unavailable)"}`} />
        <View style={{ flexDirection: "row", gap: 14, marginBottom: 8 }}>
          <LinkButton label="Show all" onPress={() => setVisible(provider.models, true)} />
          <LinkButton label="Hide all" onPress={() => setVisible(provider.models, false)} />
        </View>
      </View>
      <SettingsCard>
        {provider.models.map((m, i) => (
          <ModelRow
            key={m.id}
            model={m}
            hidden={hidden.includes(modelKey(provider.id, m))}
            isDefault={isDefaultProvider && state.settings.defaultModel === m.id}
            last={i === provider.models.length - 1}
            onPress={() => openModelMenu(m)}
          />
        ))}
      </SettingsCard>
    </View>
  )
}

/** Show / hide models in the switcher and pick the default. Tap a model for actions. */
export function ModelsSettings({ state }: { state: ServerSettingsState }) {
  const [search, setSearch] = useState("")
  const { data: providers = [], isLoading, isError } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: api.settings.providers,
    staleTime: 30_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return providers
    return providers
      .map((p) => ({ ...p, models: p.models.filter((m) => m.label.toLowerCase().includes(q) || m.api.toLowerCase().includes(q)) }))
      .filter((p) => p.models.length > 0)
  }, [providers, search])

  if (isLoading) return <ActivityIndicator color={c.accent} style={{ marginTop: 32 }} />
  if (isError || providers.length === 0) {
    return <Text style={{ color: c.fgSub, fontSize: 13 }}>{isError ? "Failed to load providers." : "No providers found."}</Text>
  }

  return (
    <View style={{ gap: 20 }}>
      <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 16 }}>
        Tap a model to make it the default for new agents or hide it from the switcher.
      </Text>
      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
        <Ionicons name="search-outline" size={15} color={c.placeholder} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search models…"
          placeholderTextColor={c.placeholder}
          style={{ flex: 1, color: c.fg, fontSize: 14, paddingVertical: 10 }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {filtered.length === 0
        ? <Text style={{ color: c.fgSub, fontSize: 13, textAlign: "center" }}>No models found</Text>
        : filtered.map((p) => <ProviderCard key={p.id} provider={p} state={state} />)}
    </View>
  )
}
