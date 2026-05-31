import { View, Text, TouchableOpacity } from "react-native"
import { c, themes, useTheme, type MobileTheme } from "@/theme"
import { SectionLabel } from "./SettingsRow"

function ThemeSwatch({ theme, active, onSelect }: { theme: MobileTheme; active: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity onPress={onSelect} style={{ width: 72, alignItems: "center", gap: 6 }}>
      <View style={{
        width: 48, height: 48, borderRadius: 12,
        backgroundColor: theme.palette.bg,
        borderWidth: 2,
        borderColor: active ? theme.palette.fgBright : theme.light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
        justifyContent: "center", alignItems: "center",
        overflow: "hidden",
      }}>
        <View style={{ flexDirection: "row", gap: 3 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.palette.fgBright }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.palette.card }} />
        </View>
        <View style={{ width: 20, height: 3, borderRadius: 1.5, backgroundColor: theme.palette.fg, marginTop: 4, opacity: 0.6 }} />
        <View style={{ width: 14, height: 3, borderRadius: 1.5, backgroundColor: theme.palette.fgSub, marginTop: 2, opacity: 0.4 }} />
      </View>
      <Text style={{
        color: active ? c.fg : c.fgSub,
        fontSize: 11,
        fontWeight: active ? "600" : "400",
        textAlign: "center",
      }} numberOfLines={1}>
        {theme.name}
      </Text>
    </TouchableOpacity>
  )
}

export function ThemePicker() {
  const { themeId, setThemeId } = useTheme()
  const sections = [
    { label: "Dark Themes", items: themes.filter((t) => !t.light) },
    { label: "Light Themes", items: themes.filter((t) => t.light) },
  ]

  return (
    <>
      {sections.map((section) => (
        <View key={section.label}>
          <SectionLabel label={section.label} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {section.items.map((t) => (
              <ThemeSwatch
                key={t.id}
                theme={t}
                active={t.id === themeId}
                onSelect={() => setThemeId(t.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </>
  )
}
