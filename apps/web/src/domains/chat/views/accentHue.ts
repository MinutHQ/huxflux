// Maps a stable seed (the agent branch) to a hue in [0, 360). The setup
// loading state and the empty chat state both derive their accent color from
// the same branch, so an agent keeps one consistent color across the
// loading -> ready transition. Branches are randomly generated names, so the
// resulting colors still look random from agent to agent.
export function accentHueFromSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash % 360
}
