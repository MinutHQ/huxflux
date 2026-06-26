import { useState } from "react"
import { useRepos } from "@huxflux/shared"
import type { Section, SettingsPageProps } from "../settings.types"
import { SettingsNav } from "./SettingsNav"
import { SettingsContent } from "./SettingsContent"
import { AddRepoDialog } from "../dialogs/AddRepoDialog"

export function SettingsPage({
  onBack, section: sectionProp, repoId: repoIdProp, onSectionChange, onRepoChange,
}: SettingsPageProps) {
  const [sectionLocal, setSectionLocal] = useState<Section>("general")
  const [selectedRepoIdLocal, setSelectedRepoIdLocal] = useState<string | null>(null)
  const section = sectionProp ?? sectionLocal
  const selectedRepoId = repoIdProp !== undefined ? repoIdProp : selectedRepoIdLocal
  const setSection = onSectionChange ?? setSectionLocal
  const setSelectedRepoId = onRepoChange ?? setSelectedRepoIdLocal
  const [showAddRepo, setShowAddRepo] = useState(false)
  const { data: repos = [] } = useRepos()

  const activeRepo = selectedRepoId ? repos.find((r) => r.id === selectedRepoId) ?? null : null

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <SettingsNav
        section={section}
        selectedRepoId={selectedRepoId}
        repos={repos}
        onBack={onBack}
        onSectionClick={setSection}
        onRepoClick={setSelectedRepoId}
        onAddRepo={() => setShowAddRepo(true)}
      />
      <SettingsContent
        section={section}
        activeRepo={activeRepo}
        onRepoRemove={() => setSelectedRepoId(null)}
        onNavigate={setSection}
      />
      {showAddRepo && (
        <AddRepoDialog
          onClose={() => setShowAddRepo(false)}
          onAdded={(id) => { setShowAddRepo(false); setSelectedRepoId(id) }}
        />
      )}
    </div>
  )
}
