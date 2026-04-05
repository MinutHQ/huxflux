import { applyColorTheme, getColorTheme, getLightColorTheme } from "./colorThemes"

export type Theme = "dark" | "light" | "system"

const KEY = "huxflux:theme"

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? "dark"
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent("huxflux:theme-change", { detail: theme }))
}

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  // Apply the appropriate color theme for the current mode
  applyColorTheme(dark ? getColorTheme() : getLightColorTheme())
}

/** Call once at app startup. Re-applies theme when the OS preference changes. */
export function watchSystemTheme() {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system")
  })
}
