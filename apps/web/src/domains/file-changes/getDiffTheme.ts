import { getTheme } from "@/lib/theme"

/**
 * Picks the pierre/diffs theme name based on the user's resolved theme.
 * Returns `"vesper"` in dark mode and `"github-light"` in light mode.
 *
 * Note: this is a plain function (not a hook) so it can be called from
 * non-React contexts (e.g. the WorkerPoolContextProvider initializer).
 */
export function getDiffTheme(): "vesper" | "github-light" {
  const theme = getTheme()
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  return isDark ? "vesper" : "github-light"
}
