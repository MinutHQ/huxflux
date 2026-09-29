import { useLocalSearchParams } from "expo-router"
import { AddRepoScreen, isAddRepoMode } from "@/domains/settings/AddRepoScreen"

export default function AddRepoRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  return <AddRepoScreen mode={isAddRepoMode(mode) ? mode : "open"} />
}
