import { useMouse } from "../../hooks/useMouse"

/**
 * Large soft radial spotlight that follows the cursor. Uses a 1.5s eased
 * transition so the highlight trails behind the mouse instead of snapping.
 */
export function MouseSpotlight() {
  const mouse = useMouse()
  return (
    <div
      className="fixed w-[800px] h-[800px] rounded-full pointer-events-none z-0 transition-all duration-[1500ms] ease-out"
      style={{
        left: mouse.x - 400,
        top: mouse.y - 400,
        background: "radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, rgba(96, 165, 250, 0.04) 40%, transparent 70%)",
      }}
    />
  )
}
