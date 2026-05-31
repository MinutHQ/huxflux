import { useLocalSearchParams } from "expo-router"
import { DiffScreen } from "@/domains/agents/DiffScreen"

export default function Diff() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>()
  return <DiffScreen agentId={id!} path={path!} />
}
