import type { FileChange } from "../agents/agents.types.js"
import type { FileSearchMatch } from "./file-changes.types.js"
import type { PRComment } from "../pull-requests/pull-requests.types.js"

// ── Changed-files tree ───────────────────────────────────────────────────────

export interface ChangedFileNode {
  type: "file"
  name: string
  path: string
  additions: number
  deletions: number
}

export interface ChangedDirNode {
  type: "directory"
  /** Display name. Chains of single-child folders are compacted (`src/lib/util`). */
  name: string
  path: string
  additions: number
  deletions: number
  children: ChangedTreeNode[]
}

export type ChangedTreeNode = ChangedFileNode | ChangedDirNode

function sortNodes(nodes: ChangedTreeNode[]): ChangedTreeNode[] {
  return nodes.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1,
  )
}

function compact(node: ChangedDirNode): ChangedDirNode {
  let current = node
  // Merge `a/` -> `b/` while the folder holds exactly one folder and nothing else.
  while (current.children.length === 1 && current.children[0]?.type === "directory") {
    const only: ChangedDirNode = current.children[0]
    current = { ...only, name: `${current.name}/${only.name}` }
  }
  return {
    ...current,
    children: sortNodes(current.children.map((c) => (c.type === "directory" ? compact(c) : c))),
  }
}

/**
 * Group changed files into a folder tree with per-folder +/- totals, the
 * way the diff pane's left column shows them. Single-child folder chains
 * collapse into one row.
 */
export function buildChangedFileTree(files: FileChange[]): ChangedTreeNode[] {
  const root: ChangedDirNode = { type: "directory", name: "", path: "", additions: 0, deletions: 0, children: [] }
  for (const f of files) {
    const parts = f.path.split("/")
    let dir = root
    dir.additions += f.additions
    dir.deletions += f.deletions
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/")
      let next = dir.children.find((c): c is ChangedDirNode => c.type === "directory" && c.path === dirPath)
      if (!next) {
        next = { type: "directory", name: parts[i] ?? "", path: dirPath, additions: 0, deletions: 0, children: [] }
        dir.children.push(next)
      }
      next.additions += f.additions
      next.deletions += f.deletions
      dir = next
    }
    dir.children.push({
      type: "file", name: parts[parts.length - 1] ?? f.path, path: f.path,
      additions: f.additions, deletions: f.deletions,
    })
  }
  return sortNodes(root.children.map((c) => (c.type === "directory" ? compact(c) : c)))
}

export interface TreeRow<N> {
  node: N
  depth: number
}

/** Depth-first flatten, skipping the children of any folder path in `collapsed`. */
export function flattenChangedTree(nodes: ChangedTreeNode[], collapsed: ReadonlySet<string>, depth = 0): TreeRow<ChangedTreeNode>[] {
  const rows: TreeRow<ChangedTreeNode>[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.type === "directory" && !collapsed.has(node.path)) {
      rows.push(...flattenChangedTree(node.children, collapsed, depth + 1))
    }
  }
  return rows
}

/** Changed files in the order the tree shows them, so the stacked diff matches the tree. */
export function orderChangedFiles<F extends { path: string }>(files: F[]): F[] {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const ordered: F[] = []
  const walk = (nodes: ChangedTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === "directory") walk(n.children)
      else {
        const f = byPath.get(n.path)
        if (f) ordered.push(f)
      }
    }
  }
  walk(buildChangedFileTree(files.map((f) => ({ path: f.path, additions: 0, deletions: 0 }))))
  return ordered
}

// ── Fuzzy path filter ────────────────────────────────────────────────────────

export interface PathMatch {
  path: string
  score: number
  /** Character offsets in `path` that matched, for highlighting. */
  indices: number[]
}

function isBoundary(path: string, i: number): boolean {
  const prev = path[i - 1]
  return i === 0 || prev === "/" || prev === "." || prev === "-" || prev === "_"
}

/**
 * Score one path against a query as a case-insensitive subsequence. Returns
 * null when not every query character appears in order. Matches in the file
 * name, at word boundaries, and in consecutive runs score higher; longer
 * paths score slightly lower so `index.ts` beats `deep/nested/index.ts`.
 */
export function matchPath(path: string, query: string): PathMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, "")
  if (!q) return { path, score: 0, indices: [] }
  const lower = path.toLowerCase()
  const nameStart = lower.lastIndexOf("/") + 1

  // Prefer matching inside the file name: try a match anchored from the name first.
  const tryFrom = (start: number): number[] | null => {
    const indices: number[] = []
    let pi = start
    for (const ch of q) {
      const found = lower.indexOf(ch, pi)
      if (found < 0) return null
      indices.push(found)
      pi = found + 1
    }
    return indices
  }
  const indices = tryFrom(nameStart) ?? tryFrom(0)
  if (!indices) return null

  let score = 0
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k] ?? 0
    score += 1
    if (i >= nameStart) score += 2
    if (isBoundary(path, i)) score += 3
    if (k > 0 && indices[k - 1] === i - 1) score += 4
  }
  if (lower.slice(nameStart).startsWith(q)) score += 10
  score -= path.length * 0.01
  return { path, score, indices }
}

/** Filter + rank paths for the file browser's name filter. */
export function fuzzyFilterPaths(paths: string[], query: string, limit = 200): PathMatch[] {
  const matches: PathMatch[] = []
  for (const p of paths) {
    const m = matchPath(p, query)
    if (m) matches.push(m)
  }
  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return matches.slice(0, limit)
}

// ── Content search grouping ──────────────────────────────────────────────────

export interface SearchMatchGroup {
  path: string
  matches: FileSearchMatch[]
}

/** Group content-search hits by file, keeping the server's order. */
export function groupSearchMatches(matches: FileSearchMatch[]): SearchMatchGroup[] {
  const groups = new Map<string, SearchMatchGroup>()
  for (const m of matches) {
    const g = groups.get(m.path)
    if (g) g.matches.push(m)
    else groups.set(m.path, { path: m.path, matches: [m] })
  }
  return [...groups.values()]
}

/** Every ancestor folder of a path, outermost first (`a/b/c.ts` -> `a`, `a/b`). */
export function ancestorDirs(path: string): string[] {
  const parts = path.split("/").slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"))
}

// ── Line comments into a chat message ────────────────────────────────────────

/**
 * Prefix a chat message with the pending line comments (from the diff or the
 * file viewer), in the format the agent sees on web and mobile alike.
 */
export function buildLineCommentsBlock(comments: PRComment[], content: string): string {
  if (comments.length === 0) return content
  const block = comments.map((c) => {
    // Full path: with a whole-repo browser, same-named files in different folders are common.
    const loc = c.path ? `${c.path}${c.line ? `:${c.line}` : ""}` : null
    return `@${c.author}${loc ? ` on \`${loc}\`` : ""}:\n> ${c.body.trim().replace(/\n/g, "\n> ")}`
  }).join("\n\n")
  return `PR review comments:\n\n${block}\n\n---\n\n${content}`
}
