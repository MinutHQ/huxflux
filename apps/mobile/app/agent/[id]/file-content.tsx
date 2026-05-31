import { useLocalSearchParams } from "expo-router"
import { FileContentScreen } from "@/domains/agents/FileContentScreen"

export default function FileContent() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>()
  return <FileContentScreen agentId={id!} path={path!} />
}
