import { useLocalSearchParams } from "expo-router"
import { RepoSettingsScreen } from "@/domains/settings/RepoSettingsScreen"

export default function RepoSettingsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <RepoSettingsScreen repoId={id!} />
}
