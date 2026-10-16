import { useCallback } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import type { OpenFileTab } from "../file-changes.types"

interface FileTabsState {
  tabs: OpenFileTab[]
  active: string | null
}

const empty: FileTabsState = { tabs: [], active: null }

function isState(raw: unknown): raw is FileTabsState {
  if (!raw || typeof raw !== "object") return false
  const r = raw as Record<string, unknown>
  return Array.isArray(r.tabs)
    && r.tabs.every((t) => t && typeof t === "object" && typeof (t as OpenFileTab).path === "string" && typeof (t as OpenFileTab).preview === "boolean")
    && (r.active === null || typeof r.active === "string")
}

/**
 * Open file tabs in the Files section, persisted per agent. A single click
 * opens a *preview* tab (italic) that the next single click replaces; a
 * double click, an edit, or a double click on the tab pins it.
 */
export function useFileTabsState(agentId: string) {
  const [state, setState] = usePersistentState(`huxflux:files:tabs:${agentId}`, empty, isState)

  const open = useCallback((path: string, opts: { pin?: boolean } = {}) => {
    setState((s) => {
      const existing = s.tabs.find((t) => t.path === path)
      if (existing) {
        const tabs = opts.pin && existing.preview ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)) : s.tabs
        return { tabs, active: path }
      }
      const tab: OpenFileTab = { path, preview: !opts.pin }
      const previewIdx = s.tabs.findIndex((t) => t.preview)
      if (!opts.pin && previewIdx >= 0) {
        const tabs = [...s.tabs]
        tabs[previewIdx] = tab
        return { tabs, active: path }
      }
      const activeIdx = s.tabs.findIndex((t) => t.path === s.active)
      const tabs = [...s.tabs]
      tabs.splice(activeIdx >= 0 ? activeIdx + 1 : tabs.length, 0, tab)
      return { tabs, active: path }
    })
  }, [setState])

  const pin = useCallback((path: string) => {
    setState((s) => (s.tabs.some((t) => t.path === path && t.preview)
      ? { ...s, tabs: s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)) }
      : s))
  }, [setState])

  const close = useCallback((path: string) => {
    setState((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.path !== path)
      const active = s.active === path ? (tabs[Math.min(idx, tabs.length - 1)]?.path ?? null) : s.active
      return { tabs, active }
    })
  }, [setState])

  const select = useCallback((path: string) => setState((s) => ({ ...s, active: path })), [setState])

  const closeAll = useCallback(() => setState(empty), [setState])

  return { tabs: state.tabs, active: state.active, open, pin, close, select, closeAll }
}
