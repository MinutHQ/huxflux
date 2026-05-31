import { cn } from "@huxflux/ui"

interface MorphBlobProps {
  color: string
  className?: string
}

/** Heavily-blurred, morphing colored blob used as ambient background. */
export function MorphBlob({ color, className }: MorphBlobProps) {
  return (
    <div
      className={cn("fixed pointer-events-none", className)}
      style={{
        background: color,
        animation: "homeMorph 8s ease-in-out infinite, homeGlow 3s ease-in-out infinite",
        filter: "blur(80px)",
      }}
    />
  )
}
