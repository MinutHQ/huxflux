// Small utilities shared by the agent-list components (sidebar surface).
// Kept separate from utils.ts (which holds terminal/PTY helpers) because the
// concerns are unrelated.

import type { AgentStatus } from "@huxflux/shared"

// ── Worktree duration tracking ────────────────────────────────────────────────

const WT_DURATION_KEY = "huxflux:worktree-durations"
const DEFAULT_DURATION_MS = 8000

/** Saved median time-to-worktree per repo, used to size the create-agent progress bar. */
export function getWorktreeDuration(repoId: string): number {
  try {
    const raw = localStorage.getItem(WT_DURATION_KEY)
    if (!raw) return DEFAULT_DURATION_MS
    const map = JSON.parse(raw) as Record<string, number>
    return map[repoId] ?? DEFAULT_DURATION_MS
  } catch { return DEFAULT_DURATION_MS }
}

export function saveWorktreeDuration(repoId: string, ms: number) {
  try {
    const raw = localStorage.getItem(WT_DURATION_KEY)
    const map = raw ? JSON.parse(raw) as Record<string, number> : {}
    map[repoId] = ms
    localStorage.setItem(WT_DURATION_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

// ── Random bee names ──────────────────────────────────────────────────────────

export const BEE_ADJECTIVES = [
  "golden", "amber", "clover", "lavender", "sage", "thyme", "meadow",
  "misty", "swift", "bright", "busy", "wild", "pollen", "honey", "wax",
  "violet", "royal", "fuzzy", "striped", "sunlit", "drowsy", "hazy",
  "nimble", "plucky", "eager", "dusky", "velvet", "copper", "crimson",
  "ivory", "marbled", "silken", "frosted", "glossy", "humming", "dappled",
  "quiet", "restless", "brisk", "gentle", "wistful", "weary", "jolly",
  "quirky", "zesty", "tangy", "sugary", "minty", "buttery", "dusty",
  "earthen", "rustic", "woodland", "linen", "willow", "cedar", "juniper",
  "hazel", "birch", "rowan", "maple", "ember", "mossy", "fernlike",
  "breezy", "sunny", "stormy", "cloudy", "starlit", "moonlit", "dawnlit",
]

export const BEE_NOUNS = [
  "scout", "forager", "guard", "worker", "drone", "nurse", "harvester",
  "wanderer", "pilgrim", "ranger", "keeper", "seeker", "drifter", "carrier",
  "gatherer", "builder", "mender", "tender", "weaver", "dancer", "singer",
  "climber", "flier", "rover", "hunter", "tracker", "watcher", "herald",
  "courier", "runner", "sifter", "sorter", "tinker", "cobbler", "scribe",
  "sage", "mystic", "dreamer", "poet", "jester", "acrobat", "trickster",
  "nomad", "voyager", "sailor", "captain", "mariner", "pathfinder", "shepherd",
  "gardener", "baker", "brewer", "smith", "potter", "carver", "painter",
]

export function randomBeeName(): string {
  const adj = BEE_ADJECTIVES[Math.floor(Math.random() * BEE_ADJECTIVES.length)]
  const noun = BEE_NOUNS[Math.floor(Math.random() * BEE_NOUNS.length)]
  // 5-char base36 suffix adds ~60M possibilities per (adj, noun) pair,
  // making collisions astronomically unlikely and preventing stale-branch
  // name reuse from false-positive "already merged" detection.
  const suffix = Math.random().toString(36).slice(2, 7).padStart(5, "0")
  return `${adj}-${noun}-${suffix}`
}

// Matches the random-bee placeholder pattern (e.g. "dawnlit-carver-mu6rh").
// Used to highlight agents that never set their own title.
const BEE_NAME_RE = /^[a-z]+-[a-z]+-[a-z0-9]{5}$/

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  return !!title && BEE_NAME_RE.test(title.trim())
}

// ── Repo color (deterministic hash → palette index) ──────────────────────────

const repoColors = [
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-teal-500/20 text-teal-400 border-teal-500/30",
]

export function repoColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % repoColors.length
  return repoColors[hash]
}

// ── Model color avatar (used when no repo) ────────────────────────────────────

export const modelColors: Record<string, string> = {
  "Opus 4.8":   "bg-primary text-primary-foreground",
  "Opus 4.7":   "bg-primary text-primary-foreground",
  "Opus 4.6":   "bg-primary text-primary-foreground",
  "Sonnet 4.6": "bg-secondary text-secondary-foreground",
  "Haiku 4.5":  "bg-muted text-muted-foreground",
  "claude-opus-4-8":            "bg-primary text-primary-foreground",
  "claude-opus-4-7":            "bg-primary text-primary-foreground",
  "claude-opus-4-6":            "bg-primary text-primary-foreground",
  "claude-sonnet-4-6":          "bg-secondary text-secondary-foreground",
  "claude-haiku-4-5-20251001":  "bg-muted text-muted-foreground",
}

// ── Status set rendered in the sidebar (cancelled is hidden) ─────────────────

export const visibleStatuses: AgentStatus[] = ["done", "in-review", "draft-pr", "in-progress", "backlog"]
