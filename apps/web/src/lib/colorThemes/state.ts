import { colorThemes } from "./themes/index"

const KEY = "huxflux:color-theme"
const LIGHT_KEY = "huxflux:color-theme-light"

export function getColorTheme(): string {
  return localStorage.getItem(KEY) ?? "stone"
}

export function getLightColorTheme(): string {
  return localStorage.getItem(LIGHT_KEY) ?? "github-light"
}

export function setColorTheme(id: string) {
  const theme = colorThemes.find((t) => t.id === id)
  if (theme?.light) {
    localStorage.setItem(LIGHT_KEY, id)
  } else {
    localStorage.setItem(KEY, id)
  }
  applyColorTheme(id)
  window.dispatchEvent(new CustomEvent("huxflux:color-theme-change", { detail: id }))
}

export function applyColorTheme(id: string) {
  const theme = colorThemes.find((t) => t.id === id)
  if (!theme) return
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
}
