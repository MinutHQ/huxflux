import { useEffect, useRef, useState } from "react"
import { View, Text, ScrollView, KeyboardAvoidingView, ActivityIndicator } from "react-native"
import { Stack, useRouter } from "expo-router"
import { api, queryKeys, useHuxfluxMutation, useRepos, type Repo, type UpdateRepoBody } from "@huxflux/shared"
import { c } from "@/theme"
import { useModal } from "@/ui"
import { PrimaryButton, ReadOnlyField, TextField } from "../components/FormField"

const SAVE_DELAY_MS = 800

interface RepoFields {
  branchFrom: string
  remote: string
  branchPrefix: string
  previewUrl: string
  setupScript: string
  runScript: string
}

function fieldsOf(repo: Repo): RepoFields {
  return {
    branchFrom: repo.branchFrom,
    remote: repo.remote,
    branchPrefix: repo.branchPrefix ?? "",
    previewUrl: repo.previewUrl ?? "",
    setupScript: repo.setupScript ?? "",
    runScript: repo.runScript ?? "",
  }
}

// Empty optional fields clear the column (`null`); the two required ones are sent as-is.
function toPatch(fields: Partial<RepoFields>): UpdateRepoBody {
  const patch: UpdateRepoBody = {}
  if (fields.branchFrom !== undefined) patch.branchFrom = fields.branchFrom
  if (fields.remote !== undefined) patch.remote = fields.remote
  if (fields.branchPrefix !== undefined) patch.branchPrefix = fields.branchPrefix || null
  if (fields.previewUrl !== undefined) patch.previewUrl = fields.previewUrl || null
  if (fields.setupScript !== undefined) patch.setupScript = fields.setupScript || null
  if (fields.runScript !== undefined) patch.runScript = fields.runScript || null
  return patch
}

/** Per-repo settings: the same fields as the web repo settings page, auto-saved. */
function RepoSettingsForm({ repo }: { repo: Repo }) {
  const router = useRouter()
  const modal = useModal()
  const [fields, setFields] = useState<RepoFields>(() => fieldsOf(repo))
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Partial<RepoFields>>({})
  const isFolder = repo.type === "folder"

  // Flush a pending save when leaving the screen instead of dropping it.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const pending = pendingRef.current
    if (Object.keys(pending).length > 0) updateRepo.mutate(toPatch(pending))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateRepo = useHuxfluxMutation<Repo, UpdateRepoBody>({
    mutationFn: (patch) => api.repos.update(repo.id, patch),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: (e) => modal.showAlert("Save failed", e instanceof Error ? e.message : undefined),
  })

  const deleteRepo = useHuxfluxMutation<unknown, void>({
    mutationFn: () => api.repos.delete(repo.id),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => router.back(),
    onError: (e) => modal.showAlert("Remove failed", e instanceof Error ? e.message : undefined),
  })

  // Only the keys touched since the last save go in the PATCH, so an edit made
  // elsewhere to another field is not overwritten by a stale snapshot.
  function change<K extends keyof RepoFields>(key: K, value: RepoFields[K]) {
    setFields((f) => ({ ...f, [key]: value }))
    pendingRef.current = { ...pendingRef.current, [key]: value }
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current
      pendingRef.current = {}
      updateRepo.mutate(toPatch(pending))
    }, SAVE_DELAY_MS)
  }

  function handleRemove() {
    modal.showConfirm(
      "Remove repository",
      `Remove "${repo.name}" and all of its workspaces from Huxflux? Files on disk are kept.`,
      "Remove",
      () => deleteRepo.mutate(),
      true,
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.fg, fontSize: 20, fontWeight: "700" }}>{repo.name}</Text>
          <Text style={{ color: c.fgSub, fontSize: 11, opacity: saved ? 1 : 0 }}>Saved</Text>
        </View>

        <ReadOnlyField label="Root path" value={repo.path} />
        {!isFolder && (
          <>
            <ReadOnlyField label="Workspaces path" value={repo.workspacesPath} />
            <Text style={{ color: c.placeholder, fontSize: 11, marginTop: -8 }}>
              Workspaces are git worktrees. Changing this path will not move existing workspaces.
            </Text>
            <TextField label="Branch new workspaces from" mono value={fields.branchFrom} onChangeText={(v) => change("branchFrom", v)} placeholder="origin/main" />
            <TextField label="Remote" mono value={fields.remote} onChangeText={(v) => change("remote", v)} placeholder="origin" />
            <TextField label="Branch prefix" mono hint="Defaults to agent/" value={fields.branchPrefix} onChangeText={(v) => change("branchPrefix", v)} placeholder="agent/" />
          </>
        )}
        <TextField label="Preview URL" mono value={fields.previewUrl} onChangeText={(v) => change("previewUrl", v)} placeholder="https://localhost:3000" keyboardType="url" />
        <TextField label="Setup script" mono multiline value={fields.setupScript} onChangeText={(v) => change("setupScript", v)} placeholder="pnpm install" />
        <TextField label="Run script" mono multiline value={fields.runScript} onChangeText={(v) => change("runScript", v)} placeholder="pnpm dev" />

        <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16, marginTop: 8 }}>
          <PrimaryButton label="Remove repository" destructive onPress={handleRemove} loading={deleteRepo.isPending} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export function RepoSettingsScreen({ repoId }: { repoId: string }) {
  const { data: repos, isLoading } = useRepos()
  const repo = repos?.find((r) => r.id === repoId)

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: repo?.name ?? "Repository" }} />
      {repo ? (
        <RepoSettingsForm key={repo.id} repo={repo} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {isLoading
            ? <ActivityIndicator color={c.accent} />
            : <Text style={{ color: c.fgSub, fontSize: 14 }}>Repository not found</Text>}
        </View>
      )}
    </View>
  )
}
