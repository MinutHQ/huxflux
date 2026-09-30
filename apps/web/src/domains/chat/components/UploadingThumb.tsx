import { IconLoader2, IconPhoto } from "@tabler/icons-react"
import type { PendingUpload } from "./chatInputBarTypes"

/**
 * Placeholder for a file that is still uploading. Images get a thumbnail-sized
 * outline with a spinner so the real thumbnail drops into the same spot; other
 * files get a filename chip with a spinner.
 */
export function UploadingThumb({ upload }: { upload: PendingUpload }) {
  if (!upload.isImage) {
    return (
      <div className="flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-lg bg-secondary border border-border text-[11px]" title={`Uploading ${upload.name}`}>
        <IconLoader2 size={12} className="animate-spin text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground/60 max-w-[160px] truncate">{upload.name}</span>
      </div>
    )
  }
  return (
    <div
      className="relative w-14 h-14 shrink-0 rounded-lg border border-dashed border-border bg-secondary/50 flex items-center justify-center"
      title={`Uploading ${upload.name}`}
      aria-label={`Uploading ${upload.name}`}
    >
      <IconPhoto size={28} className="text-muted-foreground/25" />
      <IconLoader2 size={16} className="absolute animate-spin text-muted-foreground" />
    </div>
  )
}
