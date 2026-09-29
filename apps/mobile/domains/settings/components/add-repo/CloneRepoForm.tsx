import { useState } from "react"
import { ScrollView, KeyboardAvoidingView, Text } from "react-native"
import { useRouter } from "expo-router"
import { api, queryKeys, useHuxfluxMutation, type CloneRepoBody, type Repo } from "@huxflux/shared"
import { c } from "@/theme"
import { ErrorText, PrimaryButton, TextField } from "../FormField"
import { PathInput } from "../PathInput"

function nameFromUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").split("/").pop()?.replace(/\.git$/, "") ?? ""
}

/** Clone a remote git URL onto the server and register it. Same fields as web. */
export function CloneRepoForm() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [locationOverride, setLocationOverride] = useState<string | null>(null)
  const [nameOverride, setNameOverride] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const derived = nameFromUrl(url)
  const location = locationOverride ?? (derived ? `~/projects/${derived}` : "")
  const name = nameOverride ?? derived

  const cloneRepo = useHuxfluxMutation<Repo, CloneRepoBody>({
    mutationFn: (body) => api.repos.clone(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => router.back(),
    onError: (e) => setError(e instanceof Error ? e.message : "Clone failed"),
  })

  const canSubmit = url.trim().length > 0 && location.trim().length > 0 && !cloneRepo.isPending

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    cloneRepo.mutate({ url: url.trim(), location: location.trim(), name: name.trim() || undefined })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <TextField
          label="Repository URL"
          mono
          value={url}
          onChangeText={setUrl}
          placeholder="https://github.com/user/repo"
          keyboardType="url"
          autoFocus
        />
        <PathInput label="Destination" value={location} onChange={setLocationOverride} placeholder="~/projects/repo" />
        <TextField label="Name" value={name} onChangeText={setNameOverride} placeholder={derived || "repo"} />
        <ErrorText message={error} />
        <Text style={{ color: c.placeholder, fontSize: 12 }}>
          The clone runs on the server. Large repositories may take a while.
        </Text>
        <PrimaryButton
          label={cloneRepo.isPending ? "Cloning…" : "Clone repository"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={cloneRepo.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
