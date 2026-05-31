/**
 * Diff-aware helpers used by review-comment posting. GitHub's review API
 * rejects inline comments whose line is not in the PR diff, so we snap the
 * requested line to the nearest valid line in the patch instead of failing.
 */

/** Parse hunk headers and return the closest valid new-file line in the patch. */
export function findNearestDiffLine(patch: string, targetLine: number): number | null {
  // Parse hunk headers: @@ -a,b +c,d @@ — collect all new-file line numbers in the diff
  const lines: number[] = []
  let currentLine = 0
  for (const raw of patch.split("\n")) {
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) { currentLine = parseInt(hunk[1], 10) - 1; continue }
    if (raw.startsWith("-")) continue
    currentLine++
    lines.push(currentLine)
  }
  if (lines.length === 0) return null
  return lines.reduce((best, l) => Math.abs(l - targetLine) < Math.abs(best - targetLine) ? l : best, lines[0])
}
