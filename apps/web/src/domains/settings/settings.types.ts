export type Section =
  | "general"
  | "models"
  | "appearance"
  | "git"
  | "github"
  | "review"
  | "servers"
  | "integrations"
  | "experimental"
  | "updates"

export interface SettingsPageProps {
  onBack: () => void
  section?: Section
  repoId?: string | null
  onSectionChange?: (section: Section) => void
  onRepoChange?: (repoId: string | null) => void
}
