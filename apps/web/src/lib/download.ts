import { toast } from "sonner"
import { isTauri } from "@/lib/platform"

/**
 * Save a server URL to the local machine. The browser saves it through the
 * server's `Content-Disposition: attachment`; the desktop app asks where to
 * save it and streams it there natively.
 */
export function downloadUrl(url: string, fileName: string): void {
  if (isTauri) {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<boolean>("download_file", { url, fileName }))
      .then((saved) => { if (saved) toast.success(`Downloaded ${fileName}`) })
      .catch((err: unknown) => toast.error(`Download failed: ${String(err)}`))
    return
  }
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.rel = "noreferrer"
  a.click()
}
