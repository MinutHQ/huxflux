import { View } from "react-native"
import { settingsSchema, type SettingsSection } from "@huxflux/shared"
import { SettingsCard } from "../SettingsRow"
import { SchemaField, type SettingKey } from "./SchemaField"
import type { ServerSettingsState } from "../../hooks/useServerSettings"

export function schemaKeysFor(section: SettingsSection): SettingKey[] {
  return (Object.keys(settingsSchema) as SettingKey[]).filter((k) => settingsSchema[k].section === section)
}

/**
 * Every schema entry that belongs to `section`, rendered generically. Pass
 * `exclude` for keys a screen renders with a custom control instead.
 */
export function SchemaSection({ section, state, exclude = [] }: {
  section: SettingsSection
  state: ServerSettingsState
  exclude?: SettingKey[]
}) {
  const keys = schemaKeysFor(section).filter((k) => !exclude.includes(k))
  if (keys.length === 0) return null
  return (
    <View>
      <SettingsCard>
        {keys.map((k, i) => <SchemaField key={k} settingKey={k} state={state} last={i === keys.length - 1} />)}
      </SettingsCard>
    </View>
  )
}
