import { View, ScrollView, KeyboardAvoidingView } from "react-native"
import { Stack } from "expo-router"
import { c } from "@/theme"
import { useServerSettings } from "../hooks/useServerSettings"
import { SchemaSection } from "../components/server-settings/SchemaSection"
import { ThemePicker } from "../components/ThemePicker"
import { GeneralSettings, NotificationSettings } from "../components/sections/LocalSettings"
import { ReviewSettings } from "../components/sections/ReviewSettings"
import { ModelsSettings } from "../components/sections/ModelsSettings"
import { GitHubSettings } from "../components/sections/GitHubSettings"
import { UpdatesSettings } from "../components/sections/UpdatesSettings"
import { IntegrationsSettings } from "../components/sections/IntegrationsSettings"

/** Sub-screens reachable from the Settings tab. Mirrors the web section list where it applies to mobile. */
export type MobileSettingsSection =
  | "general" | "notifications" | "appearance" | "models" | "git" | "github"
  | "review" | "integrations" | "experimental" | "updates"

export const SETTINGS_SECTIONS: { id: MobileSettingsSection; title: string; description: string; icon: string }[] = [
  { id: "general", title: "General", description: "Message display preferences", icon: "options-outline" },
  { id: "notifications", title: "Notifications", description: "Alerts when agents finish", icon: "notifications-outline" },
  { id: "appearance", title: "Appearance", description: "Theme", icon: "color-palette-outline" },
  { id: "models", title: "Models", description: "Visible models and the default", icon: "hardware-chip-outline" },
  { id: "git", title: "Git", description: "Process cleanup, PR and CI monitoring", icon: "git-merge-outline" },
  { id: "github", title: "GitHub", description: "Connection status", icon: "logo-github" },
  { id: "review", title: "Review", description: "Prompt, provider and model for AI reviews", icon: "eye-outline" },
  { id: "integrations", title: "Integrations", description: "Jira", icon: "extension-puzzle-outline" },
  { id: "experimental", title: "Experimental", description: "Thread agents", icon: "flask-outline" },
  { id: "updates", title: "Updates", description: "Channel and server version", icon: "cloud-download-outline" },
]

export function isMobileSettingsSection(value: unknown): value is MobileSettingsSection {
  return SETTINGS_SECTIONS.some((s) => s.id === value)
}

function SectionBody({ section }: { section: MobileSettingsSection }) {
  const state = useServerSettings()
  switch (section) {
    case "general": return <GeneralSettings />
    case "notifications": return <NotificationSettings />
    case "appearance": return <ThemePicker />
    case "models": return <ModelsSettings state={state} />
    case "git": return <SchemaSection section="git" state={state} />
    case "github": return <GitHubSettings />
    case "review": return <ReviewSettings state={state} />
    case "integrations": return <IntegrationsSettings state={state} />
    case "experimental": return <SchemaSection section="experimental" state={state} />
    case "updates": return <UpdatesSettings state={state} />
  }
}

export function SettingsSectionScreen({ section }: { section: MobileSettingsSection }) {
  const meta = SETTINGS_SECTIONS.find((s) => s.id === section)
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: meta?.title ?? "Settings" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <SectionBody section={section} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
