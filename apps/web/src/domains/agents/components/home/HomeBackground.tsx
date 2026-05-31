import { AuroraBackground } from "./AuroraBackground"
import { ConstellationBackground } from "./ConstellationBackground"
import { MorphBlob } from "./MorphBlob"
import { MouseSpotlight } from "./MouseSpotlight"
import { Particles } from "./Particles"

/**
 * Composes every ambient background layer behind the home dashboard:
 * constellation canvas, aurora bands, drifting particles, four morphing
 * colored blobs, and the mouse-following spotlight.
 */
export function HomeBackground() {
  return (
    <>
      <ConstellationBackground />
      <AuroraBackground />
      <Particles />
      <MorphBlob color="rgba(59, 130, 246, 0.1)" className="w-[600px] h-[600px] -top-40 -left-20" />
      <MorphBlob color="rgba(139, 92, 246, 0.08)" className="w-[500px] h-[500px] top-1/3 -right-20" />
      <MorphBlob color="rgba(16, 185, 129, 0.07)" className="w-[450px] h-[450px] bottom-20 left-1/4" />
      <MorphBlob color="rgba(251, 191, 36, 0.05)" className="w-[400px] h-[400px] top-2/3 right-1/3" />
      <MouseSpotlight />
    </>
  )
}
