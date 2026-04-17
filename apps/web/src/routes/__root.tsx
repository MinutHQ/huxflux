import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { useState, useEffect, useSyncExternalStore } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { toast, Toaster } from "sonner"
import { CommandPalette } from "@/components/CommandPalette"
import { DisconnectedBanner } from "@/components/DisconnectedBanner"
import { UpdateBanner } from "@/components/UpdateBanner"
import { useAgents, parseConnectionString, getServers, setActiveServerId, addServer, connectBackgroundServer } from "@huxflux/shared"
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

  return (
    <div className="h-screen bg-sidebar text-foreground overflow-hidden flex flex-col">
      <Toaster theme={theme === "system" ? "system" : theme} position="bottom-right" />
      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        agents={agents}
        onSelectAgent={(id) => navigate({ to: "/agent/$agentId", params: { agentId: id } })}
      />
      {import.meta.env.DEV && (
        <div data-tauri-drag-region className="px-3 py-1.5 bg-blue-600 border-b border-blue-400 text-center text-[11px] font-semibold uppercase tracking-wider text-white shrink-0">
          Dev mode
        </div>
      )}
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
