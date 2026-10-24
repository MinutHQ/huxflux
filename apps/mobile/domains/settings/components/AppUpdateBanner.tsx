import { useEffect, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Notifications from "expo-notifications"
import { c } from "@/theme"
import { prefs } from "@/lib/prefs"
import { useAppUpdate } from "../hooks/useAppUpdate"

/**
 * Floating "new version available" banner for the Android app, plus a one-time
 * system notification per version. Renders nothing when the app is current.
 */
export function AppUpdateBanner() {
  const insets = useSafeAreaInsets()
  const { available, progress, error, install } = useAppUpdate()
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    if (!available || prefs.getNotifiedAppVersion() === available.version) return
    prefs.setNotifiedAppVersion(available.version)
    Notifications.scheduleNotificationAsync({
      content: { title: "Huxflux update available", body: `Version ${available.version} is ready to download.` },
      trigger: null,
    }).catch(() => {})
  }, [available])

  if (!available || dismissed === available.version) return null
  const installing = progress !== null
  const label = installing ? `Downloading ${Math.round(progress * 100)}%` : "Update"

  return (
    <View
      style={{
        position: "absolute", left: 12, right: 12, bottom: insets.bottom + 72,
        backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14,
        padding: 14, gap: 10,
      }}
    >
      <View>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "600" }}>Huxflux {available.version} is available</Text>
        <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>
          {error ?? "Download it now; Android asks you to confirm the install."}
        </Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, alignItems: "center" }}>
        {!installing && (
          <Pressable onPress={() => setDismissed(available.version)} hitSlop={8}>
            <Text style={{ color: c.fgSub, fontSize: 14 }}>Later</Text>
          </Pressable>
        )}
        <Pressable
          onPress={install}
          disabled={installing}
          style={{ backgroundColor: c.fgBright, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, opacity: installing ? 0.7 : 1 }}
        >
          <Text style={{ color: c.fgBrightFg, fontSize: 14, fontWeight: "600" }}>{label}</Text>
        </Pressable>
      </View>
    </View>
  )
}
