import type { SoundId } from "./sounds"

const SOUND_KEY = "hive:notif:sound"
const ENABLED_KEY = "hive:notif:enabled"

export function getSoundPref(): SoundId {
  return (localStorage.getItem(SOUND_KEY) as SoundId) ?? "chime"
}

export function setSoundPref(id: SoundId) {
  localStorage.setItem(SOUND_KEY, id)
}

export function getSoundEnabled(): boolean {
  const v = localStorage.getItem(ENABLED_KEY)
  return v === null ? true : v === "true"
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem(ENABLED_KEY, String(enabled))
}
