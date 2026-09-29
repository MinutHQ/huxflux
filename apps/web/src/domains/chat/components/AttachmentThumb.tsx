import { useState } from "react"
import { IconPaperclip, IconPhotoOff, IconX } from "@tabler/icons-react"
import { attachmentUrl, isImageAttachment } from "@huxflux/shared"
import { Dialog, DialogContent, DialogTitle } from "@huxflux/ui"

interface AttachmentThumbProps {
  file: { name: string; path: string; mimeType?: string }
  size?: "sm" | "md"
  onRemove?: () => void
}

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
      aria-label="Remove attachment"
    >
      <IconX size={11} />
    </button>
  )
}

function FileChip({ name, broken, onRemove }: { name: string; broken?: boolean; onRemove?: () => void }) {
  const Icon = broken ? IconPhotoOff : IconPaperclip
  return (
    <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-secondary border border-border text-[11px]">
      <Icon size={12} className="text-muted-foreground/60 shrink-0" />
      <span className="font-medium text-foreground/80 max-w-[160px] truncate" title={broken ? `${name} (preview unavailable)` : name}>{name}</span>
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground/40 hover:text-foreground transition-colors ml-0.5" aria-label="Remove attachment">
          <IconX size={11} />
        </button>
      )}
    </div>
  )
}

/**
 * One attachment: an image thumbnail that opens full size in a dialog, or a
 * filename chip for other files and for images whose preview cannot load
 * (e.g. the server's temp dir was cleaned).
 */
export function AttachmentThumb({ file, size = "md", onRemove }: AttachmentThumbProps) {
  // Keyed on the URL so a refreshed token or new server gets a fresh attempt.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const url = isImageAttachment(file) ? attachmentUrl(file.path) : null
  const broken = !!url && brokenUrl === url
  if (!url || broken) return <FileChip name={file.name} broken={broken} onRemove={onRemove} />

  const box = size === "sm" ? "w-14 h-14" : "w-28 h-28"
  return (
    <>
      <div className={`relative ${box} shrink-0`}>
        <button
          onClick={() => setOpen(true)}
          className="w-full h-full rounded-lg overflow-hidden border border-border bg-secondary cursor-zoom-in"
          title={file.name}
        >
          <img src={url} alt={file.name} onError={() => setBrokenUrl(url)} className="w-full h-full object-cover" />
        </button>
        {onRemove && <RemoveButton onRemove={onRemove} />}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[90vw] w-auto p-2">
          <DialogTitle className="sr-only">{file.name}</DialogTitle>
          <img src={url} alt={file.name} className="max-w-[86vw] max-h-[86vh] object-contain rounded" />
        </DialogContent>
      </Dialog>
    </>
  )
}
