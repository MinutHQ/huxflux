import { useAnimatedNumber } from "../../hooks/useAnimatedNumber"
import { formatNum } from "./homeUtils"

interface AnimatedNumProps {
  value: number
  className?: string
  suffix?: string
}

/** Renders a number that animates from its previous displayed value to `value`. */
export function AnimatedNum({ value, className, suffix }: AnimatedNumProps) {
  const animated = useAnimatedNumber(value)
  return (
    <span className={className}>
      {formatNum(animated)}
      {suffix}
    </span>
  )
}
