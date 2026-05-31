import type { SoundId } from "./sounds"

const SOUND_KEY = "huxflux:notif:sound"
const ENABLED_KEY = "huxflux:notif:enabled"
const SEND_WITH_KEY = "huxflux:send:with"
const AUTO_CONVERT_KEY = "huxflux:auto:convert"
const STRIP_YOURE_RIGHT_KEY = "huxflux:strip:youre-right"
const DESKTOP_NOTIF_KEY = "huxflux:notif:desktop"

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

export type SendWith = "enter" | "cmd-enter" | "shift-enter"

export function getSendWith(): SendWith {
  return (localStorage.getItem(SEND_WITH_KEY) as SendWith) ?? "enter"
}

export function setSendWith(v: SendWith) {
  localStorage.setItem(SEND_WITH_KEY, v)
}

export function getAutoConvert(): boolean {
  const v = localStorage.getItem(AUTO_CONVERT_KEY)
  return v === null ? true : v === "true"
}

export function setAutoConvert(v: boolean) {
  localStorage.setItem(AUTO_CONVERT_KEY, String(v))
}

export function getStripYoureRight(): boolean {
  return localStorage.getItem(STRIP_YOURE_RIGHT_KEY) === "true"
}

export function setStripYoureRight(v: boolean) {
  localStorage.setItem(STRIP_YOURE_RIGHT_KEY, String(v))
}

export function getDesktopNotif(): boolean {
  const v = localStorage.getItem(DESKTOP_NOTIF_KEY)
  return v === null ? true : v === "true"
}

export function setDesktopNotif(v: boolean) {
  localStorage.setItem(DESKTOP_NOTIF_KEY, String(v))
}
