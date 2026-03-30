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
  const t = ac.currentTime
  const dur = 1.1

  // Steam whistle = fundamental + harmonics (sawtooth-ish stack)
  // Classic locomotive whistle chord: root, ~major 3rd up, ~5th up
  const harmonics = [
    { freq: 370,   gain: 0.22 },  // fundamental
    { freq: 555,   gain: 0.18 },  // ~P5 up
    { freq: 740,   gain: 0.12 },  // octave
    { freq: 925,   gain: 0.07 },  // 5th of octave
    { freq: 1110,  gain: 0.04 },  // 3rd harmonic cluster
  ]

  const masterGain = ac.createGain()
  masterGain.connect(ac.destination)
  // Envelope: sharp attack, sustained wail, trailing off
  masterGain.gain.setValueAtTime(0, t)
  masterGain.gain.linearRampToValueAtTime(1, t + 0.04)
  masterGain.gain.setValueAtTime(1, t + dur - 0.18)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  for (const h of harmonics) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    // Slight vibrato on each harmonic for that wailing character
    const vib = ac.createOscillator()
    const vibGain = ac.createGain()
    vib.frequency.value = 7
    vibGain.gain.value = h.freq * 0.012
    vib.connect(vibGain)
    vibGain.connect(osc.frequency)
    osc.type = "sawtooth"
    osc.frequency.value = h.freq
    g.gain.value = h.gain
    osc.connect(g)
    g.connect(masterGain)
    vib.start(t)
    osc.start(t)
    vib.stop(t + dur + 0.01)
    osc.stop(t + dur + 0.01)
  }

  // Breathiness: filtered noise underneath
  const noiseSize = Math.ceil(ac.sampleRate * (dur + 0.1))
  const noiseBuf = ac.createBuffer(1, noiseSize, ac.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < noiseSize; i++) nd[i] = Math.random() * 2 - 1
  const noiseSrc = ac.createBufferSource()
  noiseSrc.buffer = noiseBuf
  const bp = ac.createBiquadFilter()
  bp.type = "bandpass"
  bp.frequency.value = 600
  bp.Q.value = 0.5
  const noiseGain = ac.createGain()
  noiseGain.gain.value = 0.04
  noiseSrc.connect(bp)
  bp.connect(noiseGain)
  noiseGain.connect(masterGain)
  noiseSrc.start(t)
  noiseSrc.stop(t + dur + 0.1)
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
