import { useState, type FormEvent } from "react"
import { Button, Modal, ModalActions, cn } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { PathInput } from "../components/PathInput"

const TEMPLATES = [
  { id: "empty" as const, label: "Empty", description: "Blank project, git initialized" },
  { id: "vite" as const, label: "Vite", description: "React + TypeScript starter" },
  { id: "tanstack-start" as const, label: "TanStack Start", description: "Full-stack React framework" },
]

type TemplateId = (typeof TEMPLATES)[number]["id"]

interface QuickStartDialogProps {
  onClose: () => void
  onAdded: (id: string) => void
}

export function QuickStartDialog({ onClose, onAdded }: QuickStartDialogProps) {
  const [name, setName] = useState("")
  const [location, setLocation] = useState("~/projects")
  const [template, setTemplate] = useState<TemplateId>("empty")
  const [error, setError] = useState<string | null>(null)

  const quickStart = useHuxfluxMutation<{ id: string }, { name: string; location: string; template: TemplateId }>({
    mutationFn: (body) => api.repos.quickStart(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: (repo) => onAdded(repo.id),
    onError: (err) => setError(err instanceof Error ? err.message : "Scaffold failed"),
  })
  const isSubmitting = quickStart.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !location.trim() || isSubmitting) return
    setError(null)
    quickStart.mutate({ name: name.trim(), location: location.trim(), template })
  }

  return (
    <Modal title="Quick start" onClose={onClose} asForm onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Project name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-app"
            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Location</label>
          <PathInput value={location} onChange={setLocation} placeholder="~/projects" />
          {name.trim() && (
            <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">
              {location.trim() || "~/projects"}/{name.trim()}
            </p>
          )}
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Template</label>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left transition-colors",
                  template === t.id
                    ? "border-ring bg-accent"
                    : "border-border hover:bg-accent/50"
                )}
              >
                <span className="text-[12px] font-medium text-foreground">{t.label}</span>
                <span className="text-[11px] text-muted-foreground/60">{t.description}</span>
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}
      </div>

      <ModalActions>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || !location.trim() || isSubmitting}>
          {isSubmitting ? "Creating…" : "Create project"}
        </Button>
      </ModalActions>
    </Modal>
  )
}
