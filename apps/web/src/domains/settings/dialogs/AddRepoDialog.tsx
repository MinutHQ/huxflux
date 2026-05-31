import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Button, Modal, ModalActions, cn } from "@huxflux/ui"
import { api, queryKeys, useHuxfluxMutation, type CreateRepoBody } from "@huxflux/shared"
import { BranchFromField, ManualMode, SearchMode, type RepoResult } from "./AddRepoDialogFields"

type RepoType = "git" | "folder"

interface AddRepoDialogProps {
  onClose: () => void
  onAdded: (id: string) => void
  /** Preset the dialog into a specific mode (e.g. when launched from "Add folder"). */
  initialType?: RepoType
}

export function AddRepoDialog({ onClose, onAdded, initialType }: AddRepoDialogProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<RepoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<RepoResult | null>(null)
  const [manualPath, setManualPath] = useState("")
  const [manualName, setManualName] = useState("")
  // Folder mode is path-only (no git/branch lookup), so it implies manual entry.
  const [useManual, setUseManual] = useState(initialType === "folder")
  const [repoType, setRepoType] = useState<RepoType>(initialType ?? "git")
  const [branchFrom, setBranchFrom] = useState("origin/main")
  const [branchLoading, setBranchLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    api.repos.findRepos().then((r) => { setResults(r); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (manualPath.trim() && !manualName) {
      const parts = manualPath.replace(/\/$/, "").split("/")
      setManualName(parts[parts.length - 1] ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualPath])

  useEffect(() => {
    // Folder repos have no branches, so skip the default-branch probe entirely.
    if (!useManual || !manualPath.trim() || repoType === "folder") return
    const t = setTimeout(() => {
      setBranchLoading(true)
      api.repos.defaultBranch(manualPath.trim())
        .then((res) => setBranchFrom(res.branch))
        .catch(() => {})
        .finally(() => setBranchLoading(false))
    }, 600)
    return () => clearTimeout(t)
  }, [manualPath, useManual, repoType])

  function handleQueryChange(e: ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    setSelected(null)
    setShowResults(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      api.repos.findRepos(q).then((r) => { setResults(r); setLoading(false) }).catch(() => setLoading(false))
    }, 300)
  }

  function handleSelect(r: RepoResult) {
    setSelected(r)
    setQuery(r.name)
    setShowResults(false)
    setBranchLoading(true)
    api.repos.defaultBranch(r.path)
      .then((res) => setBranchFrom(res.branch))
      .catch(() => {})
      .finally(() => setBranchLoading(false))
  }

  const createRepo = useHuxfluxMutation<{ id: string }, CreateRepoBody>({
    mutationFn: (body) => api.repos.create(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: (repo) => onAdded(repo.id),
  })
  const isSubmitting = createRepo.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const repoPath = useManual ? manualPath.trim() : selected?.path
    const repoName = useManual
      ? (manualName.trim() || manualPath.trim().split("/").pop() || "repo")
      : selected?.name
    if (!repoPath || !repoName || isSubmitting) return
    const body: CreateRepoBody = repoType === "folder"
      ? { name: repoName, path: repoPath, branchFrom: "", remote: "", type: "folder" }
      : { name: repoName, path: repoPath, branchFrom, remote: "origin" }
    createRepo.mutate(body)
  }

  const canSubmit = useManual ? !!manualPath.trim() : !!selected
  const filtered = query.trim()
    ? results.filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.path.toLowerCase().includes(query.toLowerCase())
      )
    : results

  const title = repoType === "folder" ? "Add folder" : "Add repository"

  return (
    <Modal title={title} onClose={onClose} asForm onSubmit={handleSubmit}>
      <div className="space-y-4">
        <RepoTypeToggle
          repoType={repoType}
          onChange={(next) => {
            setRepoType(next)
            // Folder repos are always manual (we don't scan the filesystem for non-git roots).
            if (next === "folder") setUseManual(true)
          }}
        />

        {!useManual ? (
          <SearchMode
            query={query}
            loading={loading}
            filtered={filtered}
            selected={selected}
            showResults={showResults}
            searchRef={searchRef}
            onQueryChange={handleQueryChange}
            onSelect={handleSelect}
            onClearSelection={() => { setSelected(null); setQuery(""); searchRef.current?.focus() }}
            onShow={() => setShowResults(true)}
            onSwitchToManual={() => { setUseManual(true); setSelected(null); setQuery("") }}
          />
        ) : (
          <ManualMode
            manualPath={manualPath}
            manualName={manualName}
            // Switching back to "search" is only meaningful for git repos.
            allowSwitchToSearch={repoType !== "folder"}
            onPathChange={setManualPath}
            onNameChange={setManualName}
            onSwitchToSearch={() => { setUseManual(false); setManualPath(""); setManualName("") }}
          />
        )}

        {repoType !== "folder" && (
          <BranchFromField value={branchFrom} onChange={setBranchFrom} loading={branchLoading} />
        )}
      </div>

      <ModalActions>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Adding…" : repoType === "folder" ? "Add folder" : "Add repository"}
        </Button>
      </ModalActions>
    </Modal>
  )
}

function RepoTypeToggle({ repoType, onChange }: { repoType: RepoType; onChange: (next: RepoType) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-secondary rounded-lg">
      <button
        type="button"
        onClick={() => onChange("git")}
        className={cn(
          "flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors",
          repoType === "git" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Git repo
      </button>
      <button
        type="button"
        onClick={() => onChange("folder")}
        className={cn(
          "flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors",
          repoType === "folder" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Folder
      </button>
    </div>
  )
}

