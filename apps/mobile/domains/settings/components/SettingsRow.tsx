import { View, Text, Switch, TouchableOpacity, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { c } from "@/theme"

export function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={{ color: c.fgSub, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
      {label}
    </Text>
  )
}

/** Rounded card that hosts a stack of rows. `padded` adds horizontal padding for row content. */
export function SettingsCard({ children, padded = true, style }: { children: React.ReactNode; padded?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden", paddingHorizontal: padded ? 14 : 0 }, style]}>
      {children}
    </View>
  )
}

function RowText({ label, description }: { label: string; description?: string }) {
  return (
    <View style={{ flex: 1, marginRight: 12 }}>
      <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
      {description ? <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{description}</Text> : null}
    </View>
  )
}

export function SettingRow({ label, description, value, onValueChange, disabled, last }: {
  label: string
  description?: string
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border,
      opacity: disabled ? 0.5 : 1,
    }}>
      <RowText label={label} description={description} />
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: c.border, true: c.fgBright }}
        thumbColor={c.bg}
      />
    </View>
  )
}

export function SettingRowNoBorder(props: Omit<Parameters<typeof SettingRow>[0], "last">) {
  return <SettingRow {...props} last />
}

/** A row that navigates somewhere (or opens a picker). Shows an optional current value. */
export function SettingsNavRow({ icon, label, description, value, onPress, last }: {
  icon?: React.ComponentProps<typeof Ionicons>["name"]
  label: string
  description?: string
  value?: string
  onPress: () => void
  last?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border,
      }}
    >
      {icon && <Ionicons name={icon} size={18} color={c.fgSub} />}
      <RowText label={label} description={description} />
      {value ? <Text style={{ color: c.fgSub, fontSize: 13 }} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={14} color={c.fgSub} />
    </TouchableOpacity>
  )
}
