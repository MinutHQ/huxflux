import { useEffect, useState } from "react"

/**
 * Which stacked section is at the top of `root`'s viewport: the last section
 * whose top edge has scrolled to (or past) the container's top. Used to
 * highlight the current file in the diff pane's tree while scrolling.
 */
export function useActiveSection(root: HTMLElement | null, sections: Map<string, HTMLElement>, order: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const orderKey = order.join("\n")

  useEffect(() => {
    if (!root) return
    let frame = 0
    const compute = () => {
      frame = 0
      const top = root.getBoundingClientRect().top
      let current: string | null = order[0] ?? null
      for (const path of order) {
        const el = sections.get(path)
        if (!el) continue
        if (el.getBoundingClientRect().top - top <= 4) current = path
        else break
      }
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      root.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  // `order` is captured through `orderKey` so a new array with the same paths does not re-subscribe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, sections, orderKey])

  return active
}
