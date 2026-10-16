import { useEffect, useState } from "react"

// Prototype toggle between server-switcher layouts. Persisted in
// localStorage; a window event keeps every mounted switcher in sync.

const LAYOUT_KEY = "huxflux:server-switcher:layout"
const LAYOUT_EVENT = "huxflux:server-switcher-layout"

export type SwitcherLayout = "menu" | "rail" | "bottom-rail" | "chips"

export const SWITCHER_LAYOUTS: { id: SwitcherLayout; label: string }[] = [
  { id: "menu", label: "Menu" },
  { id: "rail", label: "Rail" },
  { id: "bottom-rail", label: "Bottom" },
  { id: "chips", label: "Chips" },
]

function getSwitcherLayout(): SwitcherLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY)
    return SWITCHER_LAYOUTS.some((l) => l.id === stored) ? (stored as SwitcherLayout) : "bottom-rail"
  } catch {
    return "bottom-rail"
  }
}

export function setSwitcherLayout(layout: SwitcherLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // localStorage unavailable, the change still applies for this session.
  }
  window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: layout }))
}

export function useSwitcherLayout(): SwitcherLayout {
  const [layout, setLayout] = useState<SwitcherLayout>(getSwitcherLayout)
  useEffect(() => {
    function onChange(e: Event) { setLayout((e as CustomEvent<SwitcherLayout>).detail) }
    window.addEventListener(LAYOUT_EVENT, onChange)
    return () => window.removeEventListener(LAYOUT_EVENT, onChange)
  }, [])
  return layout
}
