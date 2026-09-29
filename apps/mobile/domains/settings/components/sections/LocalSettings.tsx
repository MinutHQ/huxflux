import { useState } from "react"
import { View, Text } from "react-native"
import { c } from "@/theme"
import { prefs } from "@/lib/prefs"
import { SettingsCard, SettingRow } from "../SettingsRow"

// Device-local preferences (AsyncStorage). Nothing here touches the server.

export function GeneralSettings() {
  const [stripYoureRight, setStripYoureRight] = useState(() => prefs.getStripYoureRight())
  const [alwaysContext, setAlwaysContext] = useState(() => prefs.getAlwaysContext())

  return (
    <SettingsCard>
      <SettingRow
        label="I'm not absolutely right, thank you very much"
        description={'Strip "You\'re absolutely right!" from AI messages'}
        value={stripYoureRight}
        onValueChange={(v) => { setStripYoureRight(v); prefs.setStripYoureRight(v) }}
      />
      <SettingRow
        label="Always show context usage"
        description="Always show context percent used. By default shown only when >70% used."
        value={alwaysContext}
        onValueChange={(v) => { setAlwaysContext(v); prefs.setAlwaysContext(v) }}
        last
      />
    </SettingsCard>
  )
}

export function NotificationSettings() {
  const [enabled, setEnabled] = useState(() => prefs.getNotificationsEnabled())
  const [sound, setSound] = useState(() => prefs.getNotificationSound())

  return (
    <View style={{ gap: 12 }}>
      <SettingsCard>
        <SettingRow
          label="Notify when an agent finishes"
          description="Show a notification when an agent completes a turn"
          value={enabled}
          onValueChange={(v) => { setEnabled(v); prefs.setNotificationsEnabled(v) }}
        />
        <SettingRow
          label="Sound"
          description="Play the system notification sound"
          value={sound}
          disabled={!enabled}
          onValueChange={(v) => { setSound(v); prefs.setNotificationSound(v) }}
          last
        />
      </SettingsCard>
      <Text style={{ color: c.placeholder, fontSize: 12, lineHeight: 16 }}>
        Notifications also need permission from the system. Manage that in your device settings.
      </Text>
    </View>
  )
}
