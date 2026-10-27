import { NewAgentScreen } from "@/domains/agents/NewAgentScreen"
import { ModalProvider } from "@/ui"

// Own ModalProvider so dialogs present over this modal screen (see servers.tsx).
export default function NewAgent() {
  return <ModalProvider><NewAgentScreen /></ModalProvider>
}
