import { useCallback, useState, type RefCallback } from "react"

/**
 * Returns `[ref, inView]` where `ref` is a callback ref to attach to the
 * observed element and `inView` flips to `true` the first time the element
 * crosses the 10% intersection threshold. One-shot: the observer disconnects
 * after the first hit so the value is sticky.
 */
export function useInView<T extends HTMLElement>(): [RefCallback<T>, boolean] {
  const [inView, setInView] = useState(false)

  const ref = useCallback<RefCallback<T>>((node) => {
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(node)
  }, [])

  return [ref, inView]
}
