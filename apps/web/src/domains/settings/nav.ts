import {
  IconSettings,
  IconBrain,
  IconPalette,
  IconGitBranch,
  IconSparkles,
  IconWorld,
  IconCloud,
  IconFlask,
  IconRefresh,
} from "@tabler/icons-react"
import type { Section } from "./settings.types"

interface NavItem {
  id: Section
  label: string
  icon: typeof IconSettings
}

export const navMain: NavItem[] = [
  { id: "general", label: "General", icon: IconSettings },
  { id: "models", label: "Models", icon: IconBrain },
  { id: "appearance", label: "Appearance", icon: IconPalette },
  { id: "git", label: "Git", icon: IconGitBranch },
  { id: "review", label: "Review", icon: IconSparkles },
  { id: "integrations", label: "Integrations", icon: IconWorld },
  { id: "servers", label: "Servers", icon: IconCloud },
]

export const navMore: NavItem[] = [
  { id: "experimental", label: "Experimental", icon: IconFlask },
  { id: "updates", label: "Check for updates", icon: IconRefresh },
]

export const sectionTitles: Record<Section, string> = {
  general: "General",
  models: "Models",
  appearance: "Appearance",
  git: "Git",
  review: "Review",
  servers: "Servers",
  integrations: "Integrations",
  experimental: "Experimental",
  updates: "Check for updates",
}
