import { ServersScreen } from "@/domains/servers/ServersScreen"
import { ModalProvider } from "@/ui"

// Modal-presented routes get their own ModalProvider: the root one presents
// from the root view controller, which iOS refuses while this screen is up.
export default function ServersRoute() {
  return <ModalProvider><ServersScreen /></ModalProvider>
}
