import { applyColorTheme, getColorTheme } from "./colorThemes"

export type Theme = "dark" | "light" | "system"

const KEY = "hive:theme"

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? "dark"
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent("hive:theme-change", { detail: theme }))
}

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  // Re-apply color theme vars after toggling dark class
  if (dark) {
    applyColorTheme(getColorTheme())
  }
}

/** Call once at app startup. Re-applies theme when the OS preference changes. */
export function watchSystemTheme() {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system")
  })
}
