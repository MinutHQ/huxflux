import { useLocalSearchParams } from "expo-router"
import { AgentFilesScreen } from "@/domains/agents/AgentFilesScreen"

export default function AgentFiles() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AgentFilesScreen agentId={id!} />
}
