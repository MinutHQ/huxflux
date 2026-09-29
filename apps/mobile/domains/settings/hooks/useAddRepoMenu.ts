import { useRouter } from "expo-router"
import { useModal } from "@/ui"
import { ADD_REPO_TITLES, type AddRepoMode } from "../screens/AddRepoScreen"

const MODES: AddRepoMode[] = ["open", "folder", "clone", "quick-start"]

/**
 * Returns a function that opens the "Add workspace" action sheet (open project,
 * add folder, clone from URL, quick start) and routes to the chosen flow.
 */
export function useAddRepoMenu(): () => void {
  const router = useRouter()
  const modal = useModal()
  return () => {
    modal.showActionSheet(
      "Add workspace",
      MODES.map((mode) => ({
        label: ADD_REPO_TITLES[mode],
        onPress: () => router.push({ pathname: "/add-repo", params: { mode } }),
      })),
    )
  }
}
