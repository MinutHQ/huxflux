import { useState } from "react"
import { cn } from "@huxflux/ui"
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@huxflux/ui"
import { IconX } from "@tabler/icons-react"

interface NewAutomationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; description?: string }) => void | Promise<void>
}

export function NewAutomationDialog({ open, onOpenChange, onCreate }: NewAutomationDialogProps) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await onCreate({ name: trimmed, description: desc.trim() || undefined })
    setName("")
    setDesc("")
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) { setName(""); setDesc("") }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <DialogTitle>New automation</DialogTitle>
          <DialogClose className="ml-auto p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors">
            <IconX size={14} />
          </DialogClose>
        </div>
        <div className="px-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && name.trim()) void handleSubmit()
            }}
            placeholder="Automation name"
            className="w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/30 outline-none"
          />
        </div>
        <div className="px-4 pt-2 pb-3">
          <textarea
            value={desc}
            onChange={(e) => {
              setDesc(e.target.value)
              e.target.style.height = "auto"
              e.target.style.height = Math.min(200, e.target.scrollHeight) + "px"
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && name.trim()) void handleSubmit()
            }}
            placeholder="Describe what you want to automate..."
            rows={2}
            className="w-full bg-transparent text-[13px] text-muted-foreground placeholder:text-muted-foreground/20 outline-none resize-none overflow-hidden"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground/30 mr-auto">⌘Enter to create</span>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              name.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            Create automation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
