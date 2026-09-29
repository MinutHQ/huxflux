import { useState } from "react"
import { View, Text } from "react-native"
import { settingsSchema, type HuxfluxSettings, type SettingDef } from "@huxflux/shared"
import { c } from "@/theme"
import { SettingRow } from "../SettingsRow"
import { SegmentedControl, TextField } from "../FormField"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

export type SettingKey = keyof typeof settingsSchema

const SECRET_KEY_PATTERN = /token|secret|password/i

function TextSetting({ def, value, loaded, onCommit, secret, numeric }: {
  def: SettingDef
  value: string
  loaded: boolean
  onCommit: (v: string) => void
  secret?: boolean
  numeric?: boolean
}) {
  // Local draft while typing; `null` means "show the server value". Committed
  // once, on blur, and never before the blob has loaded, so an unloaded empty
  // default can not overwrite a stored value (e.g. the Jira token).
  const [draft, setDraft] = useState<string | null>(null)
  const placeholder = "placeholder" in def ? def.placeholder : undefined
  const shown = draft ?? value

  function commit() {
    if (!loaded || draft === null) return
    if (draft !== value) onCommit(draft)
    setDraft(null)
  }

  return (
    <View style={{ paddingVertical: 12 }}>
      <TextField
        label={def.label}
        hint={def.description}
        mono={numeric || secret}
        multiline={def.type === "longtext"}
        secureTextEntry={secret}
        keyboardType={numeric ? "number-pad" : "default"}
        editable={loaded}
        value={shown}
        onChangeText={setDraft}
        onBlur={commit}
        placeholder={placeholder}
      />
    </View>
  )
}

/**
 * Renders one entry of the shared settings schema with the control its `type`
 * calls for. Select fields whose options come from the providers endpoint
 * (`"models"` / `"providers"`) are handled by the Review screen, not here.
 */
export function SchemaField({ settingKey, state, last }: { settingKey: SettingKey; state: ServerSettingsState; last?: boolean }) {
  const def: SettingDef = settingsSchema[settingKey]
  const value = state.settings[settingKey]

  switch (def.type) {
    case "boolean":
      return (
        <SettingRow
          label={def.label}
          description={def.description}
          value={Boolean(value)}
          disabled={!state.loaded}
          onValueChange={(v) => state.update({ [settingKey]: v } as Partial<HuxfluxSettings>)}
          last={last}
        />
      )
    case "string":
    case "longtext":
      return (
        <TextSetting
          def={def}
          value={String(value ?? "")}
          loaded={state.loaded}
          secret={SECRET_KEY_PATTERN.test(settingKey)}
          onCommit={(v) => state.update({ [settingKey]: v } as Partial<HuxfluxSettings>)}
        />
      )
    case "number":
      return (
        <TextSetting
          def={def}
          numeric
          loaded={state.loaded}
          value={String(value ?? "")}
          onCommit={(v) => {
            const n = Number(v)
            if (!Number.isFinite(n)) return
            const clamped = Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n))
            state.update({ [settingKey]: clamped } as Partial<HuxfluxSettings>)
          }}
        />
      )
    case "select":
      if (!Array.isArray(def.options)) return null
      return (
        <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{def.label}</Text>
          {def.description ? <Text style={{ color: c.fgSub, fontSize: 12, lineHeight: 16 }}>{def.description}</Text> : null}
          <SegmentedControl
            options={def.options.map((o) => ({ id: o.value, label: o.label }))}
            value={String(value ?? def.default)}
            onChange={(v) => state.update({ [settingKey]: v } as Partial<HuxfluxSettings>)}
          />
        </View>
      )
    default:
      return null
  }
}
