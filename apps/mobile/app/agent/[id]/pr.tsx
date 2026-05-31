import { useLocalSearchParams } from "expo-router"
import { AgentPRPane } from "@/domains/pull-requests/AgentPRPane"

export default function AgentPRRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <AgentPRPane agentId={id!} />
}
