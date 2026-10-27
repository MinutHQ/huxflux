import { useEffect, useRef, useState } from "react"
import type { HuxfluxServer } from "@huxflux/shared"
import { useModal } from "@/ui"
import { reauthProxyServer, type SignInCancel } from "./useProxyConnect"

/**
 * Re-sign-in for proxied server rows. One sign-in runs at a time; starting
 * another cancels the first, and toggling the same row cancels it.
 */
export function useProxyReauth() {
  const modal = useModal()
  const [reauthingId, setReauthingId] = useState<string | null>(null)
  const cancelRef = useRef<SignInCancel | null>(null)

  // Closing the Servers screen stops any sign-in still waiting on Safari.
  useEffect(() => () => { if (cancelRef.current) cancelRef.current.cancelled = true }, [])

  /** Starts sign-in for `server`, or cancels it when it is already waiting. */
  async function toggle(server: HuxfluxServer) {
    if (cancelRef.current) {
      cancelRef.current.cancelled = true
      cancelRef.current = null
      if (reauthingId === server.id) { setReauthingId(null); return }
    }
    const cancel: SignInCancel = { cancelled: false }
    cancelRef.current = cancel
    setReauthingId(server.id)
    const error = await reauthProxyServer(server, cancel)
    if (cancelRef.current !== cancel) return
    cancelRef.current = null
    setReauthingId(null)
    if (error) modal.showAlert("Sign-in failed", error)
  }

  return { reauthingId, toggle }
}
