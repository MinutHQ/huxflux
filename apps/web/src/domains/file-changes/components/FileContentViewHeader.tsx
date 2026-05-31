import { IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"

interface FileContentViewHeaderProps {
  filePath: string
  content: string | undefined
}

/** Header row above the file content view: path + copy button. */
export function FileContentViewHeader({ filePath, content }: FileContentViewHeaderProps) {
  const fileName = filePath.split("/").pop() ?? filePath
  const dir = filePath.replace(`/${fileName}`, "")

  function copy() {
    if (!content) return
    void navigator.clipboard.writeText(content).then(() => toast.success("Copied"))
  }

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0 text-[11px]">
      <span className="text-muted-foreground font-mono truncate">
        {dir}/<span className="text-foreground font-semibold">{fileName}</span>
      </span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button
          onClick={copy}
          disabled={!content}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-50"
          title="Copy file"
        >
          <IconCopy size={13} />
        </button>
      </div>
    </div>
  )
}
