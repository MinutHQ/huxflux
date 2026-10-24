import { toast } from "sonner"
import { checkAttachmentSize } from "@huxflux/shared"

interface PickedFile {
  name: string
  size: number
  /** Base64 file contents; null when the file is over the attachment limit. */
  data: string | null
}

const mimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
}

function mimeTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  return mimeTypes[ext] ?? ""
}

function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Pick files with the desktop app's native dialog. The webview's own file
 * input does not reliably hand picked files to the page, so the desktop app
 * reads them natively. Resolves to an empty list when the dialog is cancelled;
 * files over the size limit are reported with a toast and left out.
 */
export async function pickFilesNative(): Promise<File[]> {
  const { invoke } = await import("@tauri-apps/api/core")
  const picked = await invoke<PickedFile[]>("pick_files")
  const files: File[] = []
  for (const f of picked) {
    if (f.data === null) {
      toast.error(checkAttachmentSize(f.name, f.size) ?? `${f.name} is too large.`)
      continue
    }
    files.push(new File([base64ToBytes(f.data)], f.name, { type: mimeTypeFor(f.name) }))
  }
  return files
}
