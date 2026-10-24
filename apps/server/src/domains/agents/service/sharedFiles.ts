// Files an agent hands to the user. Each share is a snapshot copied into a
// server-owned dir under the data dir, so the download keeps working after
// the agent rebuilds, the worktree is removed, or the machine reboots. The
// dir is removed when the agent is archived.

import * as fs from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { randomBytes } from "node:crypto"
import { HuxfluxApiError, MAX_SHARED_FILE_BYTES, formatBytes, sharedFileSchema, type SharedFile } from "@huxflux/shared"
import { DATA_DIR, isDev } from "../../../config.js"

const defaultRoot = path.join(DATA_DIR, isDev ? "shared-files-dev" : "shared-files")

/** Why a share failed, worded for the agent that asked for it. */
export class ShareFileError extends Error {}

export function sharedFilesDir(agentId: string, root: string = defaultRoot): string {
  return path.join(root, agentId)
}

/** Resolve the path an agent wrote: `~/` expands to home, relative paths resolve against `cwd`. */
function resolveSourcePath(filePath: string, cwd: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) return path.join(os.homedir(), filePath.slice(1))
  return path.resolve(cwd, filePath)
}

/**
 * Copy one file into the agent's shared store. The stored name gets a short
 * random prefix so sharing `app-release.apk` twice keeps both versions and
 * earlier messages still download what they showed at the time.
 */
export async function shareFile(
  agentId: string,
  filePath: string,
  cwd: string,
  root?: string,
): Promise<SharedFile> {
  const source = resolveSourcePath(filePath.trim(), cwd)
  const stat = await fs.stat(source).catch(() => null)
  if (!stat) throw new ShareFileError(`${source} does not exist`)
  if (!stat.isFile()) throw new ShareFileError(`${source} is not a regular file. Zip a directory before sharing it.`)
  if (stat.size > MAX_SHARED_FILE_BYTES) {
    throw new ShareFileError(`${source} is ${formatBytes(stat.size)}. The limit is ${formatBytes(MAX_SHARED_FILE_BYTES)}.`)
  }
  const name = path.basename(source)
  // basename already dropped any "/"; only characters no filesystem or URL survives are replaced,
  // so the download keeps the name the chip shows (including non-ASCII).
  const safeName = [...name].map((ch) => (ch === "\\" || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? "_" : ch)).join("")
  const file = `${randomBytes(4).toString("hex")}-${safeName}`
  const dir = sharedFilesDir(agentId, root)
  await fs.mkdir(dir, { recursive: true })
  // FICLONE makes the copy a free clone on APFS/btrfs and falls back to a plain copy elsewhere.
  await fs.copyFile(source, path.join(dir, file), fsConstants.COPYFILE_FICLONE)
  return { name, file, size: stat.size }
}

/** Resolve a stored shared file for download, or throw 400/404. */
export async function resolveSharedFile(
  agentId: string,
  file: string,
  root?: string,
): Promise<{ path: string; size: number }> {
  const dir = sharedFilesDir(agentId, root)
  const filePath = path.resolve(dir, file)
  if (!/^[\w-]+$/.test(agentId) || path.dirname(filePath) !== dir) {
    throw new HuxfluxApiError(400, "shared_file.invalid_name", "Invalid filename")
  }
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat?.isFile()) throw new HuxfluxApiError(404, "shared_file.not_found", "Shared file not found")
  return { path: filePath, size: stat.size }
}

/** Delete every file the agent shared. Missing dirs are fine. */
export async function removeSharedFiles(agentId: string, root?: string): Promise<void> {
  if (!/^[\w-]+$/.test(agentId)) return
  await fs.rm(sharedFilesDir(agentId, root), { recursive: true, force: true })
}

/** Decode the `shared_files` column. Malformed JSON reads as no files rather than failing the whole transcript. */
export function parseSharedFiles(raw: string | null): SharedFile[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = sharedFileSchema.array().safeParse(JSON.parse(raw))
    return parsed.success && parsed.data.length > 0 ? parsed.data : undefined
  } catch {
    return undefined
  }
}
