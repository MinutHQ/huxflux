import { View, Text, Switch } from "react-native"
import { c } from "@/theme"

export function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
      {label}
    </Text>
  )
}

export function SettingRow({ label, description, value, onValueChange }: {
  label: string
  description?: string
  value: boolean
  onValueChange: (v: boolean) => void
}) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
    }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {description ? <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.border, true: c.fgBright }}
        thumbColor={c.bg}
      />
    </View>
  )
}

export function SettingRowNoBorder({ label, description, value, onValueChange }: {
  label: string
  description?: string
  value: boolean
  onValueChange: (v: boolean) => void
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
        {description ? <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: c.border, true: c.fgBright }}
        thumbColor={c.bg}
      />
    </View>
  )
}
