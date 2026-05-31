import { useEffect, useRef, useState } from "react"
import type { MutableRefObject, RefObject } from "react"

export interface Particle {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
  opacity: number
  phase: number
}

export interface FlyingSymbol {
  id: number
  x: number
  y: number
  symbol: string
  flyX: number
  flyY: number
  fontSize: number
}

const SYMBOLS = ["✦", "⟡", "◈", "⬡", "✧", "⊹", "⟐", "◇", "❖", "⊛", "✶", "⟢", "△", "○", "☆"]

export function useTypewriter(fullText: string, intervalMs = 45) {
  const [typedText, setTypedText] = useState("")
  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i))
        i++
      } else {
        clearInterval(interval)
      }
    }, intervalMs)
    return () => clearInterval(interval)
  }, [fullText, intervalMs])
  return typedText
}

export function useBlinkingCursor() {
  const [showCursor, setShowCursor] = useState(true)
  useEffect(() => {
    const interval = setInterval(() => setShowCursor((c) => !c), 530)
    return () => clearInterval(interval)
  }, [])
  return showCursor
}

export function useMouseTracking(containerRef: RefObject<HTMLDivElement | null>) {
  const mouseRef = useRef({ x: -1, y: -1 })
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 } }
    container.addEventListener("mousemove", onMove)
    container.addEventListener("mouseleave", onLeave)
    return () => {
      container.removeEventListener("mousemove", onMove)
      container.removeEventListener("mouseleave", onLeave)
    }
  }, [containerRef])
  return mouseRef
}

function applyParticleFrame(
  el: HTMLDivElement,
  p: Particle,
  t: number,
  cw: number,
  ch: number,
  mx: number,
  my: number,
  hasMouse: boolean,
) {
  const baseX = (p.x / 100) * cw
  const baseY = (p.y / 100) * ch
  const floatX = Math.sin(t / p.duration * Math.PI * 2 + p.phase) * 15
  const floatY = Math.cos(t / p.duration * Math.PI * 2 + p.phase * 1.3) * 20
  const floatScale = 1 + Math.sin(t / p.duration * Math.PI * 2 + p.phase * 0.7) * 0.3
  let finalX = baseX + floatX
  let finalY = baseY + floatY
  let opacityMul = 1

  if (hasMouse) {
    const dx = mx - finalX
    const dy = my - finalY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const radius = 500
    if (dist < radius) {
      const strength = (1 - dist / radius) ** 2 * 60
      finalX -= (dx / dist) * strength
      finalY -= (dy / dist) * strength
      opacityMul = 1 + (1 - dist / radius) * 1.5
    }
  }

  el.style.transform = `translate(${finalX}px, ${finalY}px) scale(${floatScale})`
  el.style.opacity = String(Math.min(p.opacity * opacityMul, 0.7))
}

export function useParticleAnimation(
  containerRef: RefObject<HTMLDivElement | null>,
  particleRefs: MutableRefObject<(HTMLDivElement | null)[]>,
  mouseRef: MutableRefObject<{ x: number; y: number }>,
  particles: Particle[],
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let lastTime = performance.now()
    let timeAcc = 0
    let frame = 0

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000
      lastTime = now
      timeAcc += dt
      const cw = container.offsetWidth
      const ch = container.offsetHeight
      const { x: mx, y: my } = mouseRef.current
      const hasMouse = mx >= 0 && my >= 0
      for (let i = 0; i < particles.length; i++) {
        const el = particleRefs.current[i]
        if (!el) continue
        applyParticleFrame(el, particles[i], timeAcc, cw, ch, mx, my, hasMouse)
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [particles, containerRef, mouseRef, particleRefs])
}

export function useFlyingSymbols(containerRef: RefObject<HTMLDivElement | null>) {
  const [flyingSymbols, setFlyingSymbols] = useState<FlyingSymbol[]>([])
  const symbolIdRef = useRef(0)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement) !== container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const angle = Math.random() * Math.PI * 2
      const flyDist = 250 + Math.random() * 200
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
      const id = symbolIdRef.current++
      setFlyingSymbols((prev) => [...prev, {
        id, x, y, symbol,
        flyX: Math.cos(angle) * flyDist,
        flyY: Math.sin(angle) * flyDist,
        fontSize: 18 + Math.random() * 14,
      }])
      setTimeout(() => setFlyingSymbols((prev) => prev.filter((s) => s.id !== id)), 2000)
    }
    container.addEventListener("click", onClick)
    return () => container.removeEventListener("click", onClick)
  }, [containerRef])
  return flyingSymbols
}

export const CV_KEYFRAMES = `
  @keyframes cv-float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-12px) } }
  @keyframes cv-symbol-fly {
    0% { transform: translate(0, 0) scale(0.5); opacity: 1 }
    100% { transform: translate(var(--fly-x), var(--fly-y)) scale(1.5); opacity: 0 }
  }
  @keyframes cv-spin-slow { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes cv-pulse-ring { 0% { transform: scale(1); opacity: 0.4 } 100% { transform: scale(2.5); opacity: 0 } }
  @keyframes cv-glow { 0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.08), 0 0 60px rgba(251,191,36,0.04) } 50% { box-shadow: 0 0 30px rgba(251,191,36,0.15), 0 0 80px rgba(251,191,36,0.08) } }
  @keyframes cv-shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
  @keyframes cv-fade-in { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes cv-hex-bob { 0%, 100% { transform: rotate(0deg) scale(1) } 25% { transform: rotate(3deg) scale(1.05) } 75% { transform: rotate(-3deg) scale(1.05) } }
  @keyframes cv-orbit { from { transform: rotate(0deg) translateX(32px) rotate(0deg) } to { transform: rotate(360deg) translateX(32px) rotate(-360deg) } }
  @keyframes cv-status-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
  @keyframes cv-border-travel { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
`
