import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { api, checkAttachmentSize, describeUploadError } from "@huxflux/shared"

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
  const [uploadingCount, setUploadingCount] = useState(0)

  const uploadFile = useCallback(async (file: File) => {
    const tooBig = checkAttachmentSize(file.name, file.size)
    if (tooBig) {
      toast.error(tooBig)
      return
    }
    const toastId = toast.loading(`Uploading ${file.name}…`)
    setUploadingCount((n) => n + 1)
    try {
      const data = await readAsDataUrl(file)
      // fire-and-forget; intentional: user-triggered upload chained off file selection, not render-time
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.agents.uploadFile(agentId, file.name, data, file.type || "application/octet-stream")
      setAttachments((prev) => [...prev, result])
      toast.dismiss(toastId)
    } catch (err) {
      toast.error(describeUploadError(file.name, err), { id: toastId })
    } finally {
      setUploadingCount((n) => n - 1)
    }
  }, [agentId, setAttachments])

  const uploadFiles = useCallback((files: File[]) => {
    for (const file of files) uploadFile(file)
  }, [uploadFile])

  return { fileInputRef, uploadFiles, uploadingCount }
}
