export type SoundId = "chime" | "pop" | "ping" | "bell" | "buzz" | "choo-choo" | "none"

export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: "chime",    label: "Chime" },
  { id: "pop",      label: "Pop" },
  { id: "ping",     label: "Ping" },
  { id: "bell",     label: "Bell" },
  { id: "buzz",     label: "Buzz" },
  { id: "choo-choo", label: "Choo choo" },
  { id: "none",     label: "None" },
]

function ctx(): AudioContext {
  return new AudioContext()
}

function play(fn: (ac: AudioContext) => void) {
  try {
    fn(ctx())
  } catch {
    // AudioContext unavailable — silent fail
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
  // Buzzy bee-like sound: sawtooth with amplitude modulation
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
  modOsc.frequency.value = 22      // wing-beat rate
  modGain.gain.value = 40          // frequency wobble depth

  outGain.gain.setValueAtTime(0, ac.currentTime)
  outGain.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.03)
  outGain.gain.setValueAtTime(0.18, ac.currentTime + 0.25)
  outGain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.55)

  modOsc.start(ac.currentTime)
  osc.start(ac.currentTime)
  modOsc.stop(ac.currentTime + 0.56)
  osc.stop(ac.currentTime + 0.56)
}

function chooChoo(ac: AudioContext) {
  fetch("/choo-choo.mp3")
    .then((res) => res.arrayBuffer())
    .then((buf) => ac.decodeAudioData(buf))
    .then((decoded) => {
      const src = ac.createBufferSource()
      src.buffer = decoded
      src.connect(ac.destination)
      src.start(ac.currentTime)
    })
    .catch(() => {})
}

const players: Record<SoundId, (ac: AudioContext) => void> = {
  chime,
  pop,
  ping,
  bell,
  buzz,
  "choo-choo": chooChoo,
  none: () => {},
}

export function playSound(id: SoundId) {
  if (id === "none") return
  play(players[id])
}
