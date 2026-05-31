import { useEffect, useState, type FormEvent } from "react"
import { Button, Modal, ModalActions } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxMutation } from "@huxflux/shared"
import { PathInput } from "../components/PathInput"

interface CloneRepoDialogProps {
  onClose: () => void
  onAdded: (id: string) => void
}

export function CloneRepoDialog({ onClose, onAdded }: CloneRepoDialogProps) {
  const [url, setUrl] = useState("")
  const [location, setLocation] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const derived = url.trim().split("/").pop()?.replace(/\.git$/, "") ?? ""
    if (derived) {
      // Deriving local form defaults from a parsed URL — sync pattern with no cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(derived)
      setLocation(`~/projects/${derived}`)
    }
  }, [url])

  const cloneRepo = useHuxfluxMutation<{ id: string }, { url: string; location: string; name?: string }>({
    mutationFn: (body) => api.repos.clone(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: (repo) => onAdded(repo.id),
    onError: (err) => setError(err instanceof Error ? err.message : "Clone failed"),
  })
  const isSubmitting = cloneRepo.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!url.trim() || !location.trim() || isSubmitting) return
    setError(null)
    cloneRepo.mutate({ url: url.trim(), location: location.trim(), name: name.trim() || undefined })
  }

  return (
    <Modal title="Clone from URL" onClose={onClose} asForm onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Repository URL</label>
          <input
            autoFocus
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full text-sm font-mono bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Destination</label>
          <PathInput value={location} onChange={setLocation} placeholder="~/projects/repo" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={url.trim().split("/").pop()?.replace(/\.git$/, "") || "repo"}
            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring transition-colors"
          />
        </div>
        {error && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}
      </div>

      <ModalActions>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!url.trim() || !location.trim() || isSubmitting}>
          {isSubmitting ? "Cloning…" : "Clone repository"}
        </Button>
      </ModalActions>
    </Modal>
  )
}
