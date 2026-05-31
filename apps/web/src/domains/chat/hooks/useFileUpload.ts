import { useCallback, useRef } from "react"
import { toast } from "sonner"
import { api } from "@huxflux/shared"

interface Attachment {
  name: string
  path: string
  mimeType: string
}

export function useFileUpload(agentId: string, setAttachments: (updater: (prev: Attachment[]) => Attachment[]) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        // fire-and-forget; intentional: triggered by FileReader.onload callback, not render-time
        // eslint-disable-next-line no-restricted-syntax
        const result = await api.agents.uploadFile(agentId, file.name, reader.result as string, file.type)
        setAttachments((prev) => [...prev, result])
      } catch {
        toast.error(`Failed to upload ${file.name}`)
      }
    }
    reader.readAsDataURL(file)
  }, [agentId, setAttachments])

  const uploadFiles = useCallback((files: File[]) => {
    for (const file of files) uploadFile(file)
  }, [uploadFile])

  return { fileInputRef, uploadFiles }
}
