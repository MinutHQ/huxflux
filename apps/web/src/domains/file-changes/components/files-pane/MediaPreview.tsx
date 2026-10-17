import { useState } from "react"
import { api, type MediaKind } from "@huxflux/shared"

interface MediaPreviewProps {
  agentId: string
  path: string
  kind: MediaKind
}

/** Image, video or audio preview of a worktree file, streamed from the raw-file route. */
export function MediaPreview({ agentId, path, kind }: MediaPreviewProps) {
  const [failed, setFailed] = useState(false)
  const src = api.agents.rawFileUrl(agentId, path)
  if (!src || failed) {
    return <p className="p-4 text-[12px] text-muted-foreground">This file could not be previewed.</p>
  }
  const onError = () => setFailed(true)
  return (
    <div className="flex items-center justify-center h-full min-h-0 p-4 overflow-auto">
      {kind === "image" && <img src={src} alt={path} onError={onError} className="max-w-full max-h-full object-contain" />}
      {kind === "video" && <video src={src} controls onError={onError} className="max-w-full max-h-full" />}
      {kind === "audio" && <audio src={src} controls onError={onError} className="w-full max-w-md" />}
    </div>
  )
}
