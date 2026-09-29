// Chat attachments: the size cap, the "Attached files" block every client
// prepends to a user message, and the URL a client loads an uploaded file from.
// The block format is the contract between clients, the server and the model:
//
//   Attached files:
//   - name: /tmp/huxflux-attachments/<agentId>/<file>
//
//   ---
//
//   <message text>

import { HuxfluxApiError } from "../../error.js"
import { getActiveServer, serverAuthedUrl } from "../servers/servers.store.js"

/** Largest file a user can attach, in bytes (decoded, not base64). */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

export interface AttachedFile {
  name: string
  path: string
}

export interface ParsedUserContent {
  files: AttachedFile[]
  /** The message with the attachments block removed. */
  text: string
}

const BLOCK_RE = /^Attached files:\n([\s\S]*?)\n\n---(?:\n\n([\s\S]*))?$/
const LINE_RE = /^- (.+?): (.+)$/
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i

export function buildAttachedFilesBlock(text: string, files: AttachedFile[]): string {
  if (files.length === 0) return text
  const lines = files.map((f) => `- ${f.name}: ${f.path}`).join("\n")
  return `Attached files:\n${lines}\n\n---\n\n${text}`
}

export function parseAttachedFiles(content: string): ParsedUserContent {
  const match = content.match(BLOCK_RE)
  if (!match) return { files: [], text: content }
  const files: AttachedFile[] = []
  for (const line of (match[1] ?? "").split("\n")) {
    const m = line.match(LINE_RE)
    if (m?.[1] && m[2]) files.push({ name: m[1], path: m[2] })
  }
  return { files, text: match[2] ?? "" }
}

export function isImageAttachment(file: { name: string; path?: string; mimeType?: string }): boolean {
  if (file.mimeType) return file.mimeType.startsWith("image/")
  return IMAGE_EXT_RE.test(file.path ?? file.name)
}

/**
 * Authenticated URL for an uploaded attachment on the active server, or null
 * when the path is not one the upload route wrote. The owning agent id comes
 * from the path, so files uploaded to a sibling session still resolve.
 */
export function attachmentUrl(filePath: string): string | null {
  const m = filePath.match(/huxflux-attachments[\\/]([^\\/]+)[\\/]([^\\/]+)$/)
  const server = getActiveServer()
  if (!m?.[1] || !m[2] || !server) return null
  return serverAuthedUrl(server, `/api/agents/${encodeURIComponent(m[1])}/attachments/${encodeURIComponent(m[2])}`)
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/** Size check to run before reading a file into memory for upload. */
export function checkAttachmentSize(name: string, bytes: number): string | null {
  if (bytes <= 0) return `${name} is empty.`
  if (bytes > MAX_ATTACHMENT_BYTES) {
    return `${name} is ${formatBytes(bytes)}. The limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
  }
  return null
}

/** Human-readable reason an upload failed, for a toast or alert. */
export function describeUploadError(name: string, err: unknown): string {
  if (err instanceof HuxfluxApiError) {
    if (err.status === 413) return `${name} is too large. The limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
    if (err.status === 401) return `Could not upload ${name}: not signed in to this server.`
    if (err.status === 404) return `Could not upload ${name}: this chat no longer exists.`
    return `Could not upload ${name}: ${err.message}`
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return `Uploading ${name} timed out. Check the connection and try again.`
    if (/network request failed|failed to fetch|load failed/i.test(err.message)) {
      return `Could not upload ${name}: the server is unreachable.`
    }
    return `Could not upload ${name}: ${err.message}`
  }
  return `Could not upload ${name}.`
}
