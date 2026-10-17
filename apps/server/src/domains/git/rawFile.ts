import { createReadStream, type ReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { getMediaType } from "@huxflux/shared"
import { resolveInsideWorktree } from "./files.js"

export interface ByteRange {
  start: number
  /** Inclusive, like the HTTP header. */
  end: number
}

/**
 * Parse a single-range `Range: bytes=...` header against a file size.
 * Returns null when there is no usable header (serve the whole file) and
 * "unsatisfiable" for a range that starts past the end of the file (send 416).
 * Multi-range and inverted ranges are answered with the whole file, which
 * RFC 9110 allows.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | "unsatisfiable" {
  const m = header?.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (m[1] === "" && m[2] === "")) return null
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2])
    if (n === 0 || size === 0) return "unsatisfiable"
    return { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(m[1])
  if (m[2] !== "" && Number(m[2]) < start) return null
  if (start >= size) return "unsatisfiable"
  return { start, end: m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1) }
}

export interface RawFile {
  stream: ReadStream | null
  size: number
  range: ByteRange | null | "unsatisfiable"
  /** Media MIME for previewable files, `application/octet-stream` otherwise. */
  contentType: string
}

/**
 * Open a worktree file for raw byte serving. Containment goes through
 * `resolveInsideWorktree`, so symlinks out of the worktree are refused.
 * `stream` is null when the range is unsatisfiable.
 */
export async function openRawWorktreeFile(worktreePath: string, relPath: string, rangeHeader?: string): Promise<RawFile> {
  const absPath = await resolveInsideWorktree(worktreePath, relPath)
  const info = await stat(absPath)
  if (!info.isFile()) throw Object.assign(new Error("Not a file"), { code: "ENOENT" })
  const range = parseRange(rangeHeader, info.size)
  const contentType = getMediaType(relPath)?.mime ?? "application/octet-stream"
  if (range === "unsatisfiable") return { stream: null, size: info.size, range, contentType }
  const stream = range ? createReadStream(absPath, { start: range.start, end: range.end }) : createReadStream(absPath)
  return { stream, size: info.size, range, contentType }
}

/** `Content-Disposition` value with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function contentDisposition(kind: "inline" | "attachment", relPath: string): string {
  const name = relPath.slice(relPath.lastIndexOf("/") + 1)
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}
