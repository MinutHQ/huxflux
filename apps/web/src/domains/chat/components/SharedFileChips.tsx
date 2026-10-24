import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"
import { formatBytes, sharedFileUrl, type SharedFile } from "@huxflux/shared"
import { downloadUrl } from "@/lib/download"

/** Download buttons for the files an agent shared in its reply. */
export function SharedFileChips({ agentId, files }: { agentId: string; files: SharedFile[] }) {
  const handleDownload = (file: SharedFile) => {
    const url = sharedFileUrl(agentId, file.file)
    if (!url) { toast.error("No server connected"); return }
    downloadUrl(url, file.name)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {files.map((f) => (
        <button
          key={f.file}
          onClick={() => handleDownload(f)}
          className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg bg-secondary border border-border text-xs hover:bg-accent transition-colors"
          title={`Download ${f.name}`}
        >
          <IconDownload size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground max-w-[240px] truncate">{f.name}</span>
          <span className="text-muted-foreground">{formatBytes(f.size)}</span>
        </button>
      ))}
    </div>
  )
}
