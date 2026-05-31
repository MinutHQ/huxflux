import { useLocalSearchParams } from "expo-router"
import { AgentDetailScreen } from "@/domains/agents/AgentDetailScreen"
import { AgentPRPane } from "@/domains/pull-requests/AgentPRPane"

export default function AgentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AgentDetailScreen agentId={id!} prPaneSlot={<AgentPRPane agentId={id!} />} />
}
