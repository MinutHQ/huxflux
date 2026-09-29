import { useState } from "react"
import { View, ScrollView, KeyboardAvoidingView } from "react-native"
import { useRouter } from "expo-router"
import { api, queryKeys, useHuxfluxMutation, useHuxfluxQuery, type CreateRepoBody, type Repo } from "@huxflux/shared"
import { ErrorText, LinkButton, PrimaryButton, ReadOnlyField, TextField } from "../FormField"
import { PathInput } from "../PathInput"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"

export type RepoType = "git" | "folder"

function basename(p: string): string {
  return p.replace(/\/+$/, "").split("/").pop() ?? ""
}

/**
 * Final step of "Open project" / "Add folder": confirm path, name and (for git
 * repos) the branch to base new workspaces on, then register the repo.
 *
 * - `initialPath` set: the path came from the discover list and is read-only.
 * - otherwise: the path is typed by hand with directory suggestions.
 */
export function RepoDetailsForm({
  type, initialPath, onBack,
}: { type: RepoType; initialPath?: string; onBack?: () => void }) {
  const router = useRouter()
  const fromList = initialPath !== undefined
  const [path, setPath] = useState(initialPath ?? "")
  const [nameOverride, setNameOverride] = useState<string | null>(null)
  const [branchOverride, setBranchOverride] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmedPath = path.trim()
  const debouncedPath = useDebouncedValue(trimmedPath, fromList ? 0 : 600)
  const isGit = type === "git"

  const { data: detected, isFetching: loadingBranch } = useHuxfluxQuery({
    queryKey: queryKeys.repos.defaultBranch(debouncedPath),
    queryFn: () => api.repos.defaultBranch(debouncedPath),
    enabled: isGit && debouncedPath.length > 0,
    staleTime: 60_000,
    retry: false,
  })

  const name = nameOverride ?? basename(trimmedPath)
  const branchFrom = branchOverride ?? detected?.branch ?? "origin/main"

  const createRepo = useHuxfluxMutation<Repo, CreateRepoBody>({
    mutationFn: (body) => api.repos.create(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => router.back(),
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add"),
  })

  function handleSubmit() {
    const repoName = name.trim() || basename(trimmedPath) || "repo"
    if (!trimmedPath || createRepo.isPending) return
    setError(null)
    const body: CreateRepoBody = isGit
      ? { name: repoName, path: trimmedPath, branchFrom, remote: "origin" }
      : { name: repoName, path: trimmedPath, branchFrom: "", remote: "", type: "folder" }
    createRepo.mutate(body)
  }

  const canSubmit = trimmedPath.length > 0 && !createRepo.isPending

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {onBack && (
          <View style={{ flexDirection: "row" }}>
            <LinkButton label={fromList ? "‹ Change repo" : "‹ Search instead"} onPress={onBack} />
          </View>
        )}

        {fromList ? (
          <ReadOnlyField label="Path" value={path} />
        ) : (
          <PathInput
            label={isGit ? "Repository path" : "Folder path"}
            value={path}
            onChange={setPath}
            placeholder="~/projects/my-app"
          />
        )}

        <TextField
          label="Name"
          value={name}
          onChangeText={setNameOverride}
          placeholder={basename(trimmedPath) || (isGit ? "Repo name" : "Folder name")}
        />

        {isGit && (
          <TextField
            label="Branch from"
            mono
            loading={loadingBranch}
            value={branchFrom}
            onChangeText={setBranchOverride}
            placeholder="origin/main"
          />
        )}

        <ErrorText message={error} />
        <PrimaryButton
          label={isGit ? "Add repository" : "Add folder"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={createRepo.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
