import { useState } from "react"
import { View } from "react-native"
import { Stack } from "expo-router"
import type { FsRepoEntry } from "@huxflux/shared"
import { c } from "@/theme"
import { DiscoverList } from "../components/add-repo/DiscoverList"
import { RepoDetailsForm } from "../components/add-repo/RepoDetailsForm"
import { CloneRepoForm } from "../components/add-repo/CloneRepoForm"
import { QuickStartForm } from "../components/add-repo/QuickStartForm"

/** The four ways to add a workspace root, matching the web "Add workspace" menu. */
export type AddRepoMode = "open" | "folder" | "clone" | "quick-start"

export const ADD_REPO_TITLES: Record<AddRepoMode, string> = {
  open: "Open project",
  folder: "Add folder",
  clone: "Clone from URL",
  "quick-start": "Quick start",
}

export function isAddRepoMode(value: unknown): value is AddRepoMode {
  return value === "open" || value === "folder" || value === "clone" || value === "quick-start"
}

type OpenStep = { kind: "discover" } | { kind: "selected"; repo: FsRepoEntry } | { kind: "manual" }

/** Open project: pick a discovered git repo, or type a path by hand. */
function OpenProject() {
  const [step, setStep] = useState<OpenStep>({ kind: "discover" })
  if (step.kind === "discover") {
    return (
      <DiscoverList
        onSelect={(repo) => setStep({ kind: "selected", repo })}
        onManual={() => setStep({ kind: "manual" })}
      />
    )
  }
  return (
    <RepoDetailsForm
      key={step.kind === "selected" ? step.repo.path : "manual"}
      type="git"
      initialPath={step.kind === "selected" ? step.repo.path : undefined}
      onBack={() => setStep({ kind: "discover" })}
    />
  )
}

export function AddRepoScreen({ mode }: { mode: AddRepoMode }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: ADD_REPO_TITLES[mode] }} />
      {mode === "open" && <OpenProject />}
      {mode === "folder" && <RepoDetailsForm type="folder" />}
      {mode === "clone" && <CloneRepoForm />}
      {mode === "quick-start" && <QuickStartForm />}
    </View>
  )
}
