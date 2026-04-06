import { useEffect, useState } from "react"
import { useWsConnected } from "@huxflux/shared"
import { IconWifiOff, IconRefresh } from "@tabler/icons-react"

export function DisconnectedBanner() {
  const connected = useWsConnected()
  const [wasConnected, setWasConnected] = useState(false)

  useEffect(() => {
    if (connected) setWasConnected(true)
  }, [connected])

  if (!wasConnected || connected) return null

  return (
    <div data-tauri-drag-region className="flex items-center gap-3 px-4 py-2 bg-destructive/90 text-destructive-foreground text-[12px] shrink-0">
      <IconWifiOff size={13} className="shrink-0" />
      <span className="flex-1">Disconnected — reconnecting…</span>
      <IconRefresh size={12} className="shrink-0 animate-spin opacity-70" />
    </div>
  )
}
