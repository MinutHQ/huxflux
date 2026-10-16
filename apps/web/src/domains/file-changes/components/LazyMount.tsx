import { useEffect, useRef, useState, type ReactNode } from "react"

interface LazyMountProps {
  /** Placeholder height until the content mounts, so scroll positions stay stable. */
  estimatedHeight: number
  /** Scroll container used as the IntersectionObserver root. */
  root: HTMLElement | null
  /** Mount immediately (e.g. the file the user just jumped to). */
  eager?: boolean
  children: ReactNode
}

/**
 * Mounts `children` the first time the placeholder comes within ~1000px of
 * the viewport, then keeps them mounted. Keeps a 100-file stacked diff from
 * rendering every file up front.
 */
export function LazyMount({ estimatedHeight, root, eager, children }: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  const visible = seen || !!eager

  useEffect(() => {
    if (visible || !ref.current) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setSeen(true) },
      { root, rootMargin: "1000px 0px" },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible, root])

  if (visible) return <>{children}</>
  return <div ref={ref} style={{ height: estimatedHeight }} />
}
