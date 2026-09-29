// Chat attachment storage. Files land in the OS temp dir because the Claude
// CLI restricts reads to the project dir plus /tmp, and /tmp needs no
// gitignore entry.

import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { randomBytes } from "node:crypto"
import { HuxfluxApiError, MAX_ATTACHMENT_BYTES, formatBytes } from "@huxflux/shared"

/** Largest request body the upload route accepts: base64 of the cap plus JSON overhead. */
export const UPLOAD_BODY_LIMIT = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 64 * 1024

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
}

export function attachmentsDir(agentId: string, root: string = os.tmpdir()): string {
  return path.join(root, "huxflux-attachments", agentId)
}

function sanitiseName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  // Slashes are already replaced, so only the bare dot names can escape the dir.
  if (!safe || safe === "." || safe === "..") {
    throw new HuxfluxApiError(400, "attachment.invalid_name", "Invalid filename")
  }
  return safe
}

export interface SavedAttachment {
  path: string
  name: string
  mimeType: string
}

/**
 * Decode and write one upload. The stored file gets a short random prefix so
 * two uploads with the same name (every pasted screenshot is `image.png`) do
 * not overwrite each other and break earlier messages' previews.
 */
export async function saveAttachment(
  agentId: string,
  body: { name: string; data: string; mimeType: string },
  root?: string,
): Promise<SavedAttachment> {
  const safeName = sanitiseName(body.name)
  const base64 = body.data.replace(/^data:[^;]*;base64,/, "")
  const bytes = Buffer.from(base64, "base64")
  if (bytes.length === 0) {
    throw new HuxfluxApiError(400, "attachment.empty", `${safeName} is empty`)
  }
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new HuxfluxApiError(413, "attachment.too_large",
      `${safeName} is ${formatBytes(bytes.length)}. The limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`)
  }
  const dir = attachmentsDir(agentId, root)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${randomBytes(4).toString("hex")}-${safeName}`)
  await fs.writeFile(filePath, bytes)
  return { path: filePath, name: safeName, mimeType: body.mimeType }
}

/** Resolve a stored attachment for download, or throw 404. */
export async function resolveAttachment(
  agentId: string,
  fileName: string,
  root?: string,
): Promise<{ path: string; mimeType: string }> {
  const dir = attachmentsDir(agentId, root)
  const filePath = path.resolve(dir, fileName)
  if (!/^[\w-]+$/.test(agentId) || path.dirname(filePath) !== dir) {
    throw new HuxfluxApiError(400, "attachment.invalid_name", "Invalid filename")
  }
  try {
    await fs.access(filePath)
  } catch {
    throw new HuxfluxApiError(404, "attachment.not_found", "Attachment not found")
  }
  const mimeType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
  return { path: filePath, mimeType }
}
