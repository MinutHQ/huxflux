export type SoundId =
  | "chime" | "pop" | "ping" | "bell" | "buzz" | "choo-choo"
  | "giggle" | "scream" | "whistle" | "clown-horn"
  | "sprinkles" | "sparkler" | "huxflux"
  | "baby" | "michael-jackson-hehe"
  | "ive-got-this" | "daddy-chill" | "yippee" | "a-few-moments-later"
  | "apple-pay" | "windows-7-startup" | "viktor" | "succulent-chinese-meal"
  | "none"

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: "chime",      label: "Chime" },
  { id: "pop",        label: "Pop" },
  { id: "ping",       label: "Ping" },
  { id: "bell",       label: "Bell" },
  { id: "buzz",       label: "Buzz" },
  { id: "sprinkles",  label: "Sprinkles" },
  { id: "sparkler",   label: "Sparkler" },
  { id: "huxflux",    label: "Huxflux" },
  { id: "choo-choo",  label: "Choo choo" },
  { id: "giggle",     label: "Giggle" },
  { id: "scream",     label: "Scream" },
  { id: "whistle",    label: "Whistle" },
  { id: "clown-horn", label: "Clown horn" },
  { id: "baby",       label: "Baby" },
  { id: "michael-jackson-hehe", label: "Michael Jackson Hehe" },
  { id: "ive-got-this", label: "I've got this" },
  { id: "daddy-chill", label: "Daddy chill" },
  { id: "yippee",     label: "Yippee" },
  { id: "a-few-moments-later", label: "A few moments later" },
  { id: "apple-pay",  label: "Apple Pay" },
  { id: "windows-7-startup", label: "Windows 7 startup" },
  { id: "viktor",     label: "Viktor" },
  { id: "succulent-chinese-meal", label: "Succulent Chinese meal" },
  { id: "none",       label: "None" },
]

function ctx(): AudioContext {
  return new AudioContext()
}

type Player = (ac: AudioContext, onEnded?: () => void) => void

function play(fn: Player, onEnded?: () => void) {
  try {
    const ac = ctx()
    ac.resume().then(() => fn(ac, onEnded)).catch(() => onEnded?.())
  } catch {
    // AudioContext unavailable — silent fail
    onEnded?.()
  }
}

function playFile(file: string): Player {
  return (ac, onEnded) => {
    fetch(file)
      .then((res) => res.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((decoded) => {
        const src = ac.createBufferSource()
        src.buffer = decoded
        src.connect(ac.destination)
        if (onEnded) src.onended = () => onEnded()
        src.start(ac.currentTime)
      })
      .catch(() => onEnded?.())
  }
}

function chime(ac: AudioContext) {
  const freqs = [523.25, 659.25, 783.99]
  freqs.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.type = "sine"
    osc.frequency.value = freq
    const t = ac.currentTime + i * 0.12
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    osc.start(t)
    osc.stop(t + 0.46)
  })
}

function pop(ac: AudioContext) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.type = "sine"
  osc.frequency.setValueAtTime(300, ac.currentTime)
  osc.frequency.exponentialRampToValueAtTime(120, ac.currentTime + 0.08)
  gain.gain.setValueAtTime(0.25, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.1)
  osc.start(ac.currentTime)
  osc.stop(ac.currentTime + 0.11)
}

function ping(ac: AudioContext) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.type = "triangle"
  osc.frequency.value = 1046.5
  gain.gain.setValueAtTime(0.22, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6)
  osc.start(ac.currentTime)
  osc.stop(ac.currentTime + 0.61)
}

function bell(ac: AudioContext) {
  const freqs = [880, 1108.73]
  const gains = [0.2, 0.12]
  freqs.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(gains[i], ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1.2)
    osc.start(ac.currentTime)
    osc.stop(ac.currentTime + 1.21)
  })
}

function buzz(ac: AudioContext) {
  const osc = ac.createOscillator()
  const modOsc = ac.createOscillator()
  const modGain = ac.createGain()
  const outGain = ac.createGain()

  modOsc.connect(modGain)
  modGain.connect(osc.frequency)
  osc.connect(outGain)
  outGain.connect(ac.destination)

  osc.type = "sawtooth"
  osc.frequency.value = 180
  modOsc.type = "sine"
  modOsc.frequency.value = 22
  modGain.gain.value = 40

  outGain.gain.setValueAtTime(0, ac.currentTime)
  outGain.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.03)
  outGain.gain.setValueAtTime(0.18, ac.currentTime + 0.25)
  outGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.55)

  modOsc.start(ac.currentTime)
  osc.start(ac.currentTime)
  modOsc.stop(ac.currentTime + 0.56)
  osc.stop(ac.currentTime + 0.56)
}

const players: Record<SoundId, Player> = {
  chime,
  pop,
  ping,
  bell,
  buzz,
  "choo-choo":  playFile("/choo-choo.mp3"),
  "giggle":     playFile("/giggle.wav"),
  "scream":     playFile("/scream.wav"),
  "whistle":    playFile("/whistle.wav"),
  "clown-horn": playFile("/clown-horn.mp3"),
  "sprinkles":  playFile("/sprinkles.mp3"),
  "sparkler":   playFile("/sparkler.mp3"),
  "huxflux":    playFile("/huxflux.mp3"),
  "baby":       playFile("/baby.mp3"),
  "michael-jackson-hehe": playFile("/michael-jackson-hehe.mp3"),
  "ive-got-this": playFile("/ive-got-this.mp3"),
  "daddy-chill": playFile("/daddy-chill.mp3"),
  "yippee":     playFile("/yippee.mp3"),
  "a-few-moments-later": playFile("/a-few-moments-later.mp3"),
  "apple-pay":  playFile("/apple-pay.mp3"),
  "windows-7-startup": playFile("/windows-7-startup.mp3"),
  "viktor":     playFile("/viktor.mp3"),
  "succulent-chinese-meal": playFile("/succulent-chinese-meal.mp3"),
  none: () => {},
}

// Synthesized players don't signal completion; their longest tail (bell) is ~1.2s.
const synthIds: ReadonlySet<SoundId> = new Set(["chime", "pop", "ping", "bell", "buzz"])
const synthEndedMs = 1300

export function playSound(id: SoundId, onEnded?: () => void) {
  if (id === "none") return
  play(players[id], onEnded)
  if (onEnded && synthIds.has(id)) setTimeout(onEnded, synthEndedMs)
}
