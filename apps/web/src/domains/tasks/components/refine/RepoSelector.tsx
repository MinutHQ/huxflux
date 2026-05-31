import { Button, cn } from "@huxflux/ui"
import { IconCheck, IconGitBranch } from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"

export function RepoSelector({
  repos,
  selected,
  onChange,
  onConfirm,
  confirmed,
}: {
  repos: Repo[]
  selected: string[]
  onChange: (ids: string[]) => void
  onConfirm: () => void
  confirmed: boolean
}) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <div className="flex flex-wrap gap-1.5">
        {repos.map((repo) => {
          const isSelected = selected.includes(repo.id)
          return (
            <button
              key={repo.id}
              onClick={() => {
                if (confirmed) return
                onChange(
                  isSelected
                    ? selected.filter((x) => x !== repo.id)
                    : [...selected, repo.id],
                )
              }}
              disabled={confirmed}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors",
                isSelected
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                confirmed && "opacity-60 cursor-default",
              )}
            >
              <IconGitBranch size={11} />
              {repo.name}
              {isSelected && <IconCheck size={10} />}
            </button>
          )
        })}
      </div>
      {!confirmed && (
        <Button
          size="sm"
          className="self-start h-7 text-xs"
          disabled={selected.length === 0}
          onClick={onConfirm}
        >
          Confirm
        </Button>
      )}
    </div>
  )
}
