import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { themeToTreeStyles, type TreeThemeInput } from "@pierre/trees"
import { resolveTheme } from "@pierre/diffs"
import { useDiffTheme } from "./useDiffTheme"

// Resolved themes are heavy (full token tables); cache by name so we don't
// re-run the resolver on every render after a theme change.
const resolvedThemeCache = new Map<string, TreeThemeInput>()

/**
 * Resolves the active pierre theme (vesper / github-light) and translates it
 * into CSS custom properties for the pierre `FileTree`. Re-renders when the
 * app theme toggles (huxflux:theme-change) and merges in our design-system
 * variables (--card-foreground, --muted, --accent etc) so the tree blends
 * with the surrounding panel.
 */
export function useTreeThemeStyles(): CSSProperties {
  const themeName = useDiffTheme()
  const [resolvedTheme, setResolvedTheme] = useState<TreeThemeInput | null>(() => resolvedThemeCache.get(themeName) ?? null)

  useEffect(() => {
    const cached = resolvedThemeCache.get(themeName)
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: hydrate from the resolved-theme cache on theme switch
      setResolvedTheme(cached)
      return
    }
    let cancelled = false
    // @pierre/diffs's resolved theme is structurally compatible with
    // TreeThemeInput (both share the Shiki-style { type, bg, fg, colors }
    // shape) but the libraries don't share types.
    resolveTheme(themeName).then((t) => {
      if (cancelled) return
      const input = t as unknown as TreeThemeInput
      resolvedThemeCache.set(themeName, input)
      setResolvedTheme(input)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [themeName])

  return useMemo(() => {
    if (!resolvedTheme) return {} as CSSProperties
    const s = getComputedStyle(document.documentElement)
    const v = (name: string) => s.getPropertyValue(name).trim()
    const cardFg = v("--card-foreground")
    return {
      ...themeToTreeStyles(resolvedTheme),
      backgroundColor: "transparent",
      color: cardFg,
      "--trees-theme-sidebar-bg": "transparent",
      "--trees-theme-sidebar-fg": cardFg,
      "--trees-theme-panel-bg": "transparent",
      "--trees-theme-panel-fg": cardFg,
      "--trees-theme-input-bg": v("--muted"),
      "--trees-theme-input-fg": cardFg,
      "--trees-theme-input-border": v("--border"),
      "--trees-theme-list-hover-bg": v("--accent"),
      "--trees-theme-list-active-selection-bg": v("--accent"),
      "--trees-theme-list-active-selection-fg": v("--accent-foreground"),
    } as CSSProperties
  }, [resolvedTheme])
}
