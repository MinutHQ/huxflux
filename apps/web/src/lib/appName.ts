import { isTauri } from "./platform"

const key = "huxflux:app-name"

export function getAppName(): string {
  return localStorage.getItem(key) ?? ""
}

export async function applyAppName(name: string): Promise<void> {
  let displayName = name || "Huxflux"
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("set_app_name", { name })
    if (!name) {
      const { getName } = await import("@tauri-apps/api/app")
      displayName = await getName()
    }
  }
  document.title = displayName
}

export async function setAppName(value: string): Promise<void> {
  const name = value.trim()
  if (Array.from(name).length > 64 || Array.from(name).some((character) => {
    const code = character.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159)
  })) {
    throw new Error("Use at most 64 characters without control characters")
  }
  await applyAppName(name)
  if (name) localStorage.setItem(key, name)
  else localStorage.removeItem(key)
  window.dispatchEvent(new Event("app-name-changed"))
}

export function subscribeAppName(callback: () => void): () => void {
  window.addEventListener("app-name-changed", callback)
  return () => window.removeEventListener("app-name-changed", callback)
}
