import type { Repo } from "@huxflux/shared"
import type { Section } from "../settings.types"
import { sectionTitles } from "../nav"
import { GeneralSettings } from "../sections/GeneralSettings"
import { ModelsSettings } from "../sections/ModelsSettings"
import { AppearanceSettings } from "../sections/AppearanceSettings"
import { GitSettings } from "../sections/GitSettings"
import { ReviewSettings } from "../sections/ReviewSettings"
import { ServersSettings } from "../sections/ServersSettings"
import { IntegrationsSettings } from "../sections/IntegrationsSettings"
import { ExperimentalSettings } from "../sections/ExperimentalSettings"
import { UpdatesSettings } from "../sections/UpdatesSettings"
import { RepoSettings } from "../sections/RepoSettings"
import { repoColor } from "../utils"

interface SettingsContentProps {
  section: Section
  activeRepo: Repo | null
  onRepoRemove: () => void
}

export function SettingsContent({ section, activeRepo, onRepoRemove }: SettingsContentProps) {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-10 py-10">
        {activeRepo ? (
          <RepoSettings repo={activeRepo} color={repoColor(activeRepo.name)} onRemove={onRepoRemove} />
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-foreground mb-8">{sectionTitles[section]}</h1>
            <SectionView section={section} />
          </>
        )}
      </div>
    </div>
  )
}

function SectionView({ section }: { section: Section }) {
  switch (section) {
    case "general": return <GeneralSettings />
    case "models": return <ModelsSettings />
    case "appearance": return <AppearanceSettings />
    case "git": return <GitSettings />
    case "review": return <ReviewSettings />
    case "servers": return <ServersSettings />
    case "integrations": return <IntegrationsSettings />
    case "experimental": return <ExperimentalSettings />
    case "updates": return <UpdatesSettings />
  }
}
