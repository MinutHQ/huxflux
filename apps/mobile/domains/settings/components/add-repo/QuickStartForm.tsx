import { useState } from "react"
import { View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView } from "react-native"
import { useRouter } from "expo-router"
import { api, queryKeys, useHuxfluxMutation, type QuickStartRepoBody, type Repo } from "@huxflux/shared"
import { c } from "@/theme"
import { ErrorText, FieldLabel, PrimaryButton, TextField } from "../FormField"
import { PathInput } from "../PathInput"

type TemplateId = QuickStartRepoBody["template"]

const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: "empty", label: "Empty", description: "Blank project, git initialized" },
  { id: "vite", label: "Vite", description: "React + TypeScript starter" },
  { id: "tanstack-start", label: "TanStack Start", description: "Full-stack React framework" },
]

function TemplatePicker({ value, onChange }: { value: TemplateId; onChange: (t: TemplateId) => void }) {
  return (
    <View>
      <FieldLabel label="Template" />
      <View style={{ gap: 8 }}>
        {TEMPLATES.map((t) => {
          const active = t.id === value
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => onChange(t.id)}
              style={{
                backgroundColor: active ? c.secondary : c.card, borderWidth: 1,
                borderColor: active ? c.fg : c.border, borderRadius: 10, padding: 12,
              }}
            >
              <Text style={{ color: c.fg, fontSize: 13, fontWeight: "600" }}>{t.label}</Text>
              <Text style={{ color: c.fgSub, fontSize: 12, marginTop: 2 }}>{t.description}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

/** Scaffold a new project from a template on the server and register it. */
export function QuickStartForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [location, setLocation] = useState("~/projects")
  const [template, setTemplate] = useState<TemplateId>("empty")
  const [error, setError] = useState<string | null>(null)

  const quickStart = useHuxfluxMutation<Repo, QuickStartRepoBody>({
    mutationFn: (body) => api.repos.quickStart(body),
    invalidate: () => queryKeys.repos.all,
    onSuccess: () => router.back(),
    onError: (e) => setError(e instanceof Error ? e.message : "Scaffold failed"),
  })

  const canSubmit = name.trim().length > 0 && location.trim().length > 0 && !quickStart.isPending

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    quickStart.mutate({ name: name.trim(), location: location.trim(), template })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <TextField label="Project name" value={name} onChangeText={setName} placeholder="my-app" autoCapitalize="none" autoFocus />
        <View style={{ gap: 4 }}>
          <PathInput label="Location" value={location} onChange={setLocation} placeholder="~/projects" />
          {name.trim() ? (
            <Text style={{ color: c.placeholder, fontSize: 11, fontFamily: "monospace" }}>
              {location.trim() || "~/projects"}/{name.trim()}
            </Text>
          ) : null}
        </View>
        <TemplatePicker value={template} onChange={setTemplate} />
        <ErrorText message={error} />
        <PrimaryButton
          label={quickStart.isPending ? "Creating…" : "Create project"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={quickStart.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
