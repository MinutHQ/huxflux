import { useLocalSearchParams } from "expo-router"
import { SettingsSectionScreen, isMobileSettingsSection } from "@/domains/settings/SettingsSectionScreen"

export default function SettingsSectionRoute() {
  const { section } = useLocalSearchParams<{ section: string }>()
  return <SettingsSectionScreen section={isMobileSettingsSection(section) ? section : "general"} />
}
