import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ScrollArea } from "@huxflux/ui"
import { cn } from "@huxflux/ui"
import { api } from "@huxflux/shared"
import { IconCopy, IconPencil, IconDeviceFloppy, IconX } from "@tabler/icons-react"

// ── Syntax tokenizer (same as DiffView) ─────────────────────────────────────

function tokenize(text: string): Array<{ cls: string; text: string }> {
  const tokens: Array<{ cls: string; text: string }> = []
  let rest = text

  const patterns: Array<{ re: RegExp; cls: string }> = [
    { re: /^(\/\/[^\n]*)/, cls: "text-muted-foreground/70 italic" },
    { re: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, cls: "text-amber-300" },
    { re: /^(\$\{[^}]*\})/, cls: "text-sky-300" },
    { re: /^(\b(?:async|await|return|const|let|var|function|class|import|export|from|if|else|try|catch|throw|new|this|typeof|private|readonly|public)\b)/, cls: "text-violet-400" },
    { re: /^(\b(?:string|number|boolean|Promise|void|undefined|null|Date)\b)/, cls: "text-sky-400" },
    { re: /^(\b[A-Z][a-zA-Z0-9]*\b)/, cls: "text-teal-400" },
    { re: /^(\b\d+(?:px|em|rem|s)?\b)/, cls: "text-orange-300" },
    { re: /^([()[\]{}<>:;,=+\-*/%&|!?.@])/, cls: "text-muted-foreground/70" },
    { re: /^(\w+)/, cls: "text-foreground/90" },
    { re: /^(\s+)/, cls: "" },
    { re: /^(.)/, cls: "text-muted-foreground/70" },
  ]

  while (rest.length > 0) {
    let matched = false
    for (const { re, cls } of patterns) {
      const m = rest.match(re)
      if (m) {
        tokens.push({ cls, text: m[1] })
        rest = rest.slice(m[1].length)
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push({ cls: "", text: rest[0] })
      rest = rest.slice(1)
    }
  }
  return tokens
}

// ── Main component ───────────────────────────────────────────────────────────

export function FileContentView({ agentId, filePath }: { agentId: string; filePath: string }) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const { data: content } = useQuery({
    queryKey: ["file-content", agentId, filePath],
    queryFn: () => api.getFileContent(agentId, filePath),
    staleTime: 10_000,
  })

  const fileName = filePath.split("/").pop() ?? filePath
  const lines = content?.split("\n") ?? []
  const hasChanges = editing && editContent !== (content ?? "")

  function enterEdit() {
    setEditContent(content ?? "")
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditContent("")
  }

  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await api.saveFileContent(agentId, filePath, editContent)
      queryClient.invalidateQueries({ queryKey: ["file-content", agentId, filePath] })
      setEditing(false)
      toast.success("File saved")
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`)
    } finally {
      setSaving(false)
    }
  }, [agentId, filePath, editContent, saving, queryClient])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  // Cmd+S to save
  useEffect(() => {
    if (!editing) return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
      }
      if (e.key === "Escape") {
        cancelEdit()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [editing, save])

  const editLines = editContent.split("\n")

  return (
    <div className="flex flex-col h-full bg-background">
      {/* File header */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
        <span className="text-muted-foreground font-mono truncate">
          {filePath.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        {editing && hasChanges && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Modified
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Cancel (Esc)"
              >
                <IconX size={13} />
                <span>Cancel</span>
              </button>
              <button
                onClick={save}
                disabled={saving || !hasChanges}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded transition-colors",
                  hasChanges
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-secondary text-muted-foreground cursor-default"
                )}
                title="Save (⌘S)"
              >
                <IconDeviceFloppy size={12} />
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={enterEdit}
                className="flex items-center gap-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Edit file"
              >
                <IconPencil size={13} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => content && navigator.clipboard.writeText(content)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Copy file"
              >
                <IconCopy size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 min-h-0">
        {editing ? (
          <div className="h-full flex">
            {/* Line numbers for editor */}
            <div className="py-1 shrink-0 bg-background border-r border-border/50 select-none overflow-hidden">
              {editLines.map((_, i) => (
                <div key={i} className="w-10 text-right pr-3 text-[11px] text-muted-foreground/40 leading-[1.65] font-mono">
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              className="flex-1 min-w-0 bg-background text-foreground font-mono text-[12px] leading-[1.65] py-1 pl-2 pr-4 resize-none focus:outline-none overflow-auto"
              style={{ tabSize: 2 }}
            />
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="font-mono text-[12px] leading-[1.65]">
              {lines.map((line, i) => (
                <div key={i} className="flex items-stretch hover:bg-card/60">
                  <div className="w-10 shrink-0 text-right pr-3 py-0.5 select-none text-[11px] text-muted-foreground/40">
                    {i + 1}
                  </div>
                  <div className="flex-1 py-0.5 pl-2 pr-4 whitespace-pre overflow-hidden">
                    {tokenize(line).map((tok, j) => (
                      <span key={j} className={tok.cls}>{tok.text}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
