import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { useState, useEffect, useSyncExternalStore } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { toast, Toaster } from "sonner"
import { CommandPalette } from "@/app-shell/CommandPalette"
import { DisconnectedBanner } from "@/app-shell/banners/DisconnectedBanner"
import { UpdateBanner } from "@/app-shell/banners/UpdateBanner"
import { useAgents, parseConnectionString, getServers, setActiveServerId, addServer, updateServer, connectBackgroundServer } from "@huxflux/shared"
import { useServers } from "@/hooks/useServers"
import { useUpdater } from "@/hooks/useUpdater"
import { isTauri } from "@/lib/platform"
import { getTheme, type Theme } from "@/lib/theme"
import { playSound } from "@/lib/sounds"
import { getSoundEnabled, getSoundPref } from "@/lib/notificationPrefs"

function useCurrentTheme(): Theme {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("huxflux:theme-change", cb); return () => window.removeEventListener("huxflux:theme-change", cb) },
    getTheme,
    () => "dark"
  )
}

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const theme = useCurrentTheme()
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const { data: agents = [] } = useAgents()
  const { servers, activeId, refresh: refreshServers } = useServers()
  const { update, isInstalling, progress, needsManualRestart, downloadAndInstall } = useUpdater()
  const navigate = Route.useNavigate()

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("huxflux:toggle-sidebar"))
      }
      if (e.key === "F1") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("huxflux:toggle-terminal-maximize"))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        navigate({ to: "/settings" })
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("huxflux:open-shortcuts"))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("huxflux:new-agent"))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCmdkOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  // Auto-register server from ?connect= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connectParam = params.get("connect")
    if (!connectParam) return
    const parsed = parseConnectionString(connectParam)
    if (!parsed) return
    params.delete("connect")
    const newSearch = params.toString()
    window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname)
    const existing = getServers()
    const already = existing.find((s) => s.url === parsed.url)
    if (already) {
      setActiveServerId(already.id)
    } else {
      const server = addServer({ name: "My Server", url: parsed.url, token: parsed.token })
      setActiveServerId(server.id)
    }
    refreshServers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-connect is handled synchronously in tryAutoConnectSync (called from
  // _app.tsx beforeLoad) using window.__huxflux_connection injected by Tauri.
  // This async effect handles token/URL updates on subsequent launches when
  // the Tauri invoke returns fresher data than what was injected at startup.
  useEffect(() => {
    if (!isTauri) return
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<string | null>("read_local_connection").then((json) => {
        if (!json) return
        try {
          const conn = JSON.parse(json) as { url: string; token: string }
          if (!conn.url) return
          const normalizeUrl = (u: string) => u.replace("://localhost", "://127.0.0.1")
          const existing = getServers()
          const already = existing.find((s) => normalizeUrl(s.url) === normalizeUrl(conn.url))
          if (already) {
            const updates: { token?: string; url?: string } = {}
            if (already.token !== conn.token) updates.token = conn.token
            if (already.url !== conn.url) updates.url = conn.url
            if (Object.keys(updates).length > 0) {
              updateServer(already.id, updates)
              refreshServers()
            }
          }
        } catch { /* malformed connection JSON; ignore */ }
      }).catch(() => { /* no local connection */ })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Background WS connections for non-active servers
  useEffect(() => {
    const backgroundServers = servers.filter((s) => s.id !== activeId)
    const cleanups = backgroundServers.map((server) => {
      const wsBase = server.url.replace(/^http/, "ws") + "/ws"
      const wsUrl = server.token ? `${wsBase}?token=${server.token}` : wsBase
      return connectBackgroundServer(wsUrl, (event) => {
        if (event.type !== "message:done") return
        toast.success(`Agent finished on ${server.name}`, {
          description: "Claude has completed its response.",
          duration: 4000,
        })
        if (getSoundEnabled()) playSound(getSoundPref())
      })
    })
    return () => { for (const cleanup of cleanups) cleanup() }
  }, [servers, activeId])

  // Dev mode toast on window focus (works in both browser and Tauri)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let blurred = false
    let cleanup: (() => void) | null = null

    function showDevToast() {
      toast("Dev mode", {
        description: "Running against development database",
        duration: 2000,
        style: { background: "#2563eb", color: "white", border: "1px solid #3b82f6" },
      })
    }

    if (isTauri) {
      // Tauri: use native window events
      import("@tauri-apps/api/event").then(({ listen }) => {
        const unlisten1 = listen("tauri://blur", () => { blurred = true })
        const unlisten2 = listen("tauri://focus", () => {
          if (blurred) { blurred = false; showDevToast() }
        })
        cleanup = () => { unlisten1.then((u) => u()); unlisten2.then((u) => u()) }
      })
    } else {
      // Browser: use visibilitychange
      const onVis = () => {
        if (document.visibilityState === "hidden") blurred = true
        else if (blurred) { blurred = false; showDevToast() }
      }
      document.addEventListener("visibilitychange", onVis)
      cleanup = () => document.removeEventListener("visibilitychange", onVis)
    }

    return () => { cleanup?.() }
  }, [])

  return (
    <div className="h-screen bg-sidebar text-foreground overflow-hidden flex flex-col">
      <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        agents={agents}
        onSelectAgent={(id) => navigate({ to: "/agent/$agentId", params: { agentId: id } })}
      />
      <DisconnectedBanner />
      {isTauri && update && (
        <UpdateBanner
          update={update}
          isInstalling={isInstalling}
          progress={progress}
          isIdle={agents.every((a) => !a.streaming && a.status !== "in-progress")}
          needsManualRestart={needsManualRestart}
          onInstall={downloadAndInstall}
        />
      )}
      <Outlet />
    </div>
  )
}
