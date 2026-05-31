import type { PRTreeEntry } from "./pull-requests.types"

/** "just now" / "3m ago" / "2h ago" / "5d ago" / "2mo ago" formatting for ISO timestamps. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/**
 * From a unified diff patch, extract the hunk closest to `targetLine` on the
 * new (additions) side. Returns up to ~10 lines starting from the @@ header.
 */
export function extractDiffHunk(patch: string, targetLine: number | undefined): string | null {
  if (!targetLine) return null
  const lines = patch.split("\n")
  let bestHunkStart = -1
  let bestDistance = Infinity
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (m) {
      const hunkStart = parseInt(m[1]!, 10)
      const hunkLen = m[2] ? parseInt(m[2], 10) : 1
      const dist =
        targetLine >= hunkStart && targetLine < hunkStart + hunkLen
          ? 0
          : Math.min(Math.abs(targetLine - hunkStart), Math.abs(targetLine - (hunkStart + hunkLen)))
      if (dist < bestDistance) {
        bestDistance = dist
        bestHunkStart = i
      }
    }
  }
  if (bestHunkStart === -1) return null
  const hunkLines: string[] = []
  hunkLines.push(lines[bestHunkStart] ?? "")
  for (let j = bestHunkStart + 1; j < lines.length && hunkLines.length <= 10; j++) {
    const line = lines[j] ?? ""
    if (line.startsWith("@@")) break
    hunkLines.push(line)
  }
  return hunkLines.join("\n")
}

/**
 * Convert a GitHub-style file patch (no diff header) into a full unified
 * git-diff so it can be fed to `@pierre/diffs`'s `PatchDiff`.
 */
export function patchToGitDiff(filePath: string, patch: string): string {
  return `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n${patch}`
}

/** Build a nested directory tree from a flat list of PR files. */
export function buildPRFileTree(
  files: { path: string; additions: number; deletions: number }[],
  viewedFiles: Set<string>,
): PRTreeEntry[] {
  const root: PRTreeEntry[] = []
  for (const file of files) {
    const parts = file.path.split("/")
    let current = root
    let builtPath = ""
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!
      builtPath = builtPath ? `${builtPath}/${segment}` : segment
      const isFile = i === parts.length - 1
      let node = current.find((n) => n.name === segment)
      if (!node) {
        node = isFile
          ? {
              name: segment,
              path: file.path,
              type: "file",
              additions: file.additions,
              deletions: file.deletions,
              viewed: viewedFiles.has(file.path),
            }
          : { name: segment, path: builtPath, type: "directory", children: [] }
        current.push(node)
      }
      if (!isFile) current = node.children!
    }
  }
  return root
}
