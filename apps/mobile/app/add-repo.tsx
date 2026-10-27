import { useLocalSearchParams } from "expo-router"
import { AddRepoScreen, isAddRepoMode } from "@/domains/settings/AddRepoScreen"
import { ModalProvider } from "@/ui"

// Own ModalProvider so dialogs present over this modal screen (see servers.tsx).
export default function AddRepoRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  return <ModalProvider><AddRepoScreen mode={isAddRepoMode(mode) ? mode : "open"} /></ModalProvider>
}
