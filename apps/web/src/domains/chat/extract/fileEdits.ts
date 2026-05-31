import type { ToolCall } from "@huxflux/shared"
import type { TurnFileEdit } from "../chat.types"

export function extractFileEdits(calls: ToolCall[]): TurnFileEdit[] {
  const byPath = new Map<string, TurnFileEdit>()

  function processCalls(list: ToolCall[]) {
    for (const tc of list) {
      if (tc.subCalls) processCalls(tc.subCalls)
      if (tc.tool !== "Edit" && tc.tool !== "Write") continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any
      try { parsed = JSON.parse(tc.args ?? "{}") } catch { continue }
      const filePath = parsed.file_path
      if (!filePath) continue

      let entry = byPath.get(filePath)
      if (!entry) {
        entry = { path: filePath, edits: [], isNew: tc.tool === "Write" }
        byPath.set(filePath, entry)
      }

      if (tc.tool === "Edit" && parsed.old_string != null && parsed.new_string != null) {
        entry.edits.push({ oldStr: parsed.old_string, newStr: parsed.new_string })
      } else if (tc.tool === "Write") {
        entry.isNew = true
        entry.edits.push({ oldStr: "", newStr: parsed.content ?? "" })
      }
    }
  }

  processCalls(calls)
  return Array.from(byPath.values())
}

/** Generate a unified diff string from old/new text pairs for a single file.
 *  Extracts common prefix/suffix lines as context around each change. */
export function makeUnifiedDiff(filePath: string, edits: Array<{ oldStr: string; newStr: string }>, isNew: boolean): string {
  const CONTEXT = 3
  const lines: string[] = []
  const aPrefix = isNew ? "/dev/null" : `a/${filePath}`
  const bPrefix = `b/${filePath}`
  lines.push(`--- ${aPrefix}`)
  lines.push(`+++ ${bPrefix}`)

  let oldOffset = 1
  let newOffset = 1

  for (const edit of edits) {
    const oLines = edit.oldStr ? edit.oldStr.split("\n") : []
    const nLines = edit.newStr ? edit.newStr.split("\n") : []

    // Find common prefix lines
    let prefixLen = 0
    while (prefixLen < oLines.length && prefixLen < nLines.length && oLines[prefixLen] === nLines[prefixLen]) {
      prefixLen++
    }

    // Find common suffix lines (don't overlap with prefix)
    let suffixLen = 0
    while (
      suffixLen < oLines.length - prefixLen &&
      suffixLen < nLines.length - prefixLen &&
      oLines[oLines.length - 1 - suffixLen] === nLines[nLines.length - 1 - suffixLen]
    ) {
      suffixLen++
    }

    // Context: keep up to CONTEXT lines from prefix/suffix
    const ctxBefore = Math.min(prefixLen, CONTEXT)
    const ctxAfter = Math.min(suffixLen, CONTEXT)
    const changeOldStart = prefixLen - ctxBefore
    const changeOldEnd = oLines.length - suffixLen + ctxAfter
    const changeNewStart = prefixLen - ctxBefore
    const changeNewEnd = nLines.length - suffixLen + ctxAfter

    const hunkOldLines = oLines.slice(changeOldStart, changeOldEnd)
    const hunkNewLines = nLines.slice(changeNewStart, changeNewEnd)

    // Build hunk with context
    const hunkLines: string[] = []
    // Leading context
    for (let i = 0; i < ctxBefore; i++) {
      hunkLines.push(` ${oLines[prefixLen - ctxBefore + i]}`)
    }
    // Changed lines
    const removedStart = ctxBefore
    const removedEnd = hunkOldLines.length - ctxAfter
    const addedStart = ctxBefore
    const addedEnd = hunkNewLines.length - ctxAfter
    for (let i = removedStart; i < removedEnd; i++) {
      hunkLines.push(`-${hunkOldLines[i]}`)
    }
    for (let i = addedStart; i < addedEnd; i++) {
      hunkLines.push(`+${hunkNewLines[i]}`)
    }
    // Trailing context
    for (let i = 0; i < ctxAfter; i++) {
      hunkLines.push(` ${oLines[oLines.length - suffixLen + i]}`)
    }

    const oCount = ctxBefore + (removedEnd - removedStart) + ctxAfter
    const nCount = ctxBefore + (addedEnd - addedStart) + ctxAfter
    lines.push(`@@ -${oldOffset + changeOldStart},${oCount} +${newOffset + changeNewStart},${nCount} @@`)
    lines.push(...hunkLines)

    oldOffset += oLines.length
    newOffset += nLines.length
  }

  return lines.join("\n") + "\n"
}
