import type { ReactNode } from "react"
import { useInView } from "../../hooks/useInView"

interface AnimatedSectionProps {
  children: ReactNode
  delay?: number
}

/**
 * Wrapper that fades + slides + scales its children into view the first time
 * they cross the viewport. The `delay` is a CSS transition-delay in ms applied
 * once `inView` flips to true. One-shot via `useInView`.
 */
export function AnimatedSection({ children, delay = 0 }: AnimatedSectionProps) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className="transition-all duration-700 ease-out"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0) scale(1)" : "translateY(30px) scale(0.98)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
