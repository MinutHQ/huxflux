import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { api, checkAttachmentSize, describeUploadError, isImageAttachment } from "@huxflux/shared"
import { isTauri } from "@/lib/platform"
import { pickFilesNative } from "@/lib/pickFiles"
import type { PendingUpload } from "../components/chatInputBarTypes"

interface Attachment {
  name: string
  path: string
  mimeType: string
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"))
    reader.readAsDataURL(file)
  })
}

export function useFileUpload(agentId: string, setAttachments: (updater: (prev: Attachment[]) => Attachment[]) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nextUploadId = useRef(0)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])

  const uploadFile = useCallback(async (file: File) => {
    const tooBig = checkAttachmentSize(file.name, file.size)
    if (tooBig) {
      toast.error(tooBig)
      return
    }
    const mimeType = file.type || "application/octet-stream"
    const pending: PendingUpload = { id: String(nextUploadId.current++), name: file.name, isImage: isImageAttachment({ name: file.name, mimeType: file.type || undefined }) }
    setPendingUploads((prev) => [...prev, pending])
    try {
      const data = await readAsDataUrl(file)
      // fire-and-forget; intentional: user-triggered upload chained off file selection, not render-time
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.agents.uploadFile(agentId, file.name, data, mimeType)
      setAttachments((prev) => [...prev, result])
    } catch (err) {
      toast.error(describeUploadError(file.name, err))
    } finally {
      setPendingUploads((prev) => prev.filter((u) => u.id !== pending.id))
    }
  }, [agentId, setAttachments])

  const uploadFiles = useCallback((files: File[]) => {
    for (const file of files) uploadFile(file)
  }, [uploadFile])

  // The desktop webview's file input does not reliably deliver picked files,
  // so the desktop app uses a native dialog. Browsers use the hidden input.
  const openFilePicker = useCallback(() => {
    if (!isTauri) {
      fileInputRef.current?.click()
      return
    }
    pickFilesNative()
      .then(uploadFiles)
      .catch((err: unknown) => toast.error(`Could not attach files: ${String(err)}`))
  }, [uploadFiles])

  return { fileInputRef, openFilePicker, uploadFiles, pendingUploads, uploadingCount: pendingUploads.length }
}
