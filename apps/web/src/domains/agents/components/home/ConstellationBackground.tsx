import { useEffect, useRef } from "react"

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  hue: number
}

const NODE_COUNT = 160
const MAX_LINK_DIST = 180
const MOUSE_INFLUENCE_RADIUS = 200

function initNodes(): Node[] {
  const w = window.innerWidth
  const h = window.innerHeight
  const nodes: Node[] = []
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 1.5 + 1,
      // blue → violet → teal hue range
      hue: Math.random() * 80 + 200,
    })
  }
  return nodes
}

function stepNodes(nodes: Node[], mouse: { x: number; y: number }, w: number, h: number) {
  for (const n of nodes) {
    const dx = n.x - mouse.x
    const dy = n.y - mouse.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MOUSE_INFLUENCE_RADIUS && dist > 0) {
      const force = ((MOUSE_INFLUENCE_RADIUS - dist) / MOUSE_INFLUENCE_RADIUS) * 0.3
      n.vx += (dx / dist) * force
      n.vy += (dy / dist) * force
    }
    n.x += n.vx
    n.y += n.vy
    n.vx *= 0.998
    n.vy *= 0.998
    if (n.x < -20) n.x = w + 20
    if (n.x > w + 20) n.x = -20
    if (n.y < -20) n.y = h + 20
    if (n.y > h + 20) n.y = -20
  }
}

function drawConnections(ctx: CanvasRenderingContext2D, nodes: Node[]) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!
      const b = nodes[j]!
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MAX_LINK_DIST) {
        const alpha = (1 - dist / MAX_LINK_DIST) * 0.2
        const hue = (a.hue + b.hue) / 2
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `hsla(${hue}, 70%, 65%, ${alpha})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
    }
  }
}

function drawNodes(ctx: CanvasRenderingContext2D, nodes: Node[]) {
  for (const n of nodes) {
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6)
    grad.addColorStop(0, `hsla(${n.hue}, 80%, 70%, 0.2)`)
    grad.addColorStop(1, `hsla(${n.hue}, 80%, 65%, 0)`)
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r * 6, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${n.hue}, 90%, 80%, 0.7)`
    ctx.fill()
  }
}

function drawMouseLinks(ctx: CanvasRenderingContext2D, nodes: Node[], mouse: { x: number; y: number }) {
  for (const n of nodes) {
    const dx = n.x - mouse.x
    const dy = n.y - mouse.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MOUSE_INFLUENCE_RADIUS) {
      const alpha = (1 - dist / MOUSE_INFLUENCE_RADIUS) * 0.25
      ctx.beginPath()
      ctx.moveTo(n.x, n.y)
      ctx.lineTo(mouse.x, mouse.y)
      ctx.strokeStyle = `hsla(${n.hue}, 80%, 70%, ${alpha})`
      ctx.lineWidth = 0.6
      ctx.stroke()
    }
  }
}

/**
 * Full-viewport canvas painting a constellation of softly-glowing nodes,
 * pairs of nodes linked when within `MAX_LINK_DIST`, plus mouse-repulsion
 * and short-range lines to the cursor. The drawing loop, node array,
 * resize handler and mouse tracker all live in refs so they don't
 * trigger re-renders.
 */
export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const rafRef = useRef(0)
  const mouseRef = useRef({ x: -1000, y: -1000 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    if (nodesRef.current.length === 0) {
      nodesRef.current = initNodes()
    }

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", handleMouse, { passive: true })

    const draw = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      stepNodes(nodesRef.current, mouseRef.current, w, h)
      drawConnections(ctx, nodesRef.current)
      drawNodes(ctx, nodesRef.current)
      drawMouseLinks(ctx, nodesRef.current, mouseRef.current)
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouse)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />
}
