import { cn } from "@huxflux/ui"
import { IconArrowLeft, IconPlus } from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"
import { navMain, navMore } from "../nav"
import type { Section } from "../settings.types"
import { repoColor } from "../utils"

interface SettingsNavProps {
  section: Section
  selectedRepoId: string | null
  repos: Repo[]
  onBack: () => void
  onSectionClick: (section: Section) => void
  onRepoClick: (repoId: string) => void
  onAddRepo: () => void
}

export function SettingsNav({
  section, selectedRepoId, repos, onBack, onSectionClick, onRepoClick, onAddRepo,
}: SettingsNavProps) {
  return (
    <div className="w-56 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="px-3 py-4 border-b border-sidebar-border shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-sidebar-accent w-full"
        >
          <IconArrowLeft size={15} />
          Back to app
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <NavGroup
          items={navMain}
          activeSection={section}
          repoSelected={!!selectedRepoId}
          onClick={onSectionClick}
        />

        <SectionLabel>More</SectionLabel>
        <NavGroup
          items={navMore}
          activeSection={section}
          repoSelected={!!selectedRepoId}
          onClick={onSectionClick}
        />

        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">Repositories</span>
          <button
            onClick={onAddRepo}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <IconPlus size={13} />
          </button>
        </div>
        <RepoList repos={repos} selectedId={selectedRepoId} onSelect={onRepoClick} onAdd={onAddRepo} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">{children}</span>
    </div>
  )
}

interface NavGroupProps {
  items: typeof navMain
  activeSection: Section
  repoSelected: boolean
  onClick: (section: Section) => void
}

function NavGroup({ items, activeSection, repoSelected, onClick }: NavGroupProps) {
  return (
    <div className="p-2 space-y-0.5">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onClick(id)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
            !repoSelected && activeSection === id
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
          )}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  )
}

interface RepoListProps {
  repos: Repo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

function RepoList({ repos, selectedId, onSelect, onAdd }: RepoListProps) {
  return (
    <div className="p-2 space-y-0.5">
      {repos.map((repo) => {
        const color = repoColor(repo.name)
        return (
          <button
            key={repo.id}
            onClick={() => onSelect(repo.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-left",
              selectedId === repo.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            )}
          >
            <span className={cn("w-5 h-5 rounded-sm border text-[10px] font-bold flex items-center justify-center shrink-0", color)}>
              {repo.name[0].toUpperCase()}
            </span>
            <span className="truncate">{repo.name}</span>
          </button>
        )
      })}
      {repos.length === 0 && (
        <button
          onClick={onAdd}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground/40 hover:text-muted-foreground transition-colors rounded-md"
        >
          <IconPlus size={13} />
          Add repository
        </button>
      )}
    </div>
  )
}
