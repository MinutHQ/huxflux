import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ScrollArea } from "@hive/ui"
import { cn } from "@hive/ui"
import type { FileChange } from "@/data/mock"
import { api } from "@hive/shared"
import { IconCopy, IconEye } from "@tabler/icons-react"

// ── Diff parsing ──────────────────────────────────────────────────────────────

type DiffLine = { type: "add" | "del" | "ctx" | "hunk"; text: string; lineNo?: number }

function parseUnifiedDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let addNo = 1
  let delNo = 1
  for (const line of raw.split("\n")) {
    if (line.startsWith("@@")) {
      // Parse @@ -a,b +c,d @@ to get starting line numbers
      const m = line.match(/@@ -(\d+).*\+(\d+)/)
      if (m) { delNo = parseInt(m[1]); addNo = parseInt(m[2]) }
      lines.push({ type: "hunk", text: line })
    } else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) {
      // skip meta lines
    } else if (line.startsWith("+")) {
      lines.push({ type: "add", text: line.slice(1), lineNo: addNo++ })
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", text: line.slice(1), lineNo: delNo++ })
    } else if (line.startsWith(" ")) {
      lines.push({ type: "ctx", text: line.slice(1), lineNo: addNo++ })
      delNo++
    }
  }
  return lines
}

// ── Syntax tokenizer ──────────────────────────────────────────────────────────

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

// ── Inline comment form ───────────────────────────────────────────────────────

function CommentForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-focus on mount
  useState(() => { setTimeout(() => ref.current?.focus(), 0) })

  return (
    <div className="bg-card/60 border-y border-border mx-0 py-3 px-4">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
            onSubmit(text.trim())
          }
          if (e.key === "Escape") onCancel()
        }}
        placeholder="Add a comment for the AI"
        rows={2}
        className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-none font-sans leading-relaxed"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          onClick={onCancel}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Cancel
        </button>
        <button
          onClick={() => text.trim() && onSubmit(text.trim())}
          className={cn(
            "text-[12px] px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1",
            text.trim()
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-secondary text-muted-foreground cursor-default"
          )}
        >
          Comment <span className="text-[10px] opacity-60">↵</span>
        </button>
      </div>
    </div>
  )
}

// ── Saved comment thread ──────────────────────────────────────────────────────

function CommentThread({ comments }: { comments: string[] }) {
  return (
    <div className="bg-card/40 border-y border-border px-4 py-3 space-y-2">
      {comments.map((c, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-bold text-primary-foreground shrink-0 mt-0.5">
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[11px] font-semibold text-foreground">alexmartosp</span>
              <span className="text-[10px] text-muted-foreground/50">just now</span>
            </div>
            <p className="text-[12px] text-foreground/80 leading-relaxed">{c}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiffView({ agentId, file }: { agentId: string; file: FileChange }) {
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [comments, setComments] = useState<Record<number, string[]>>({})
  const [viewed, setViewed] = useState(false)

  const { data: rawDiff } = useQuery({
    queryKey: ["diff", agentId, file.path],
    queryFn: () => api.getDiff(agentId, file.path),
    staleTime: 10_000,
  })

  const fileName = file.path.split("/").pop() ?? file.path
  const lines = rawDiff ? parseUnifiedDiff(rawDiff) : []

  let addLineNo = 1
  let delLineNo = 1

  function handleSubmitComment(lineIdx: number, text: string) {
    setComments((prev) => ({ ...prev, [lineIdx]: [...(prev[lineIdx] ?? []), text] }))
    setActiveCommentLine(null)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* File header */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-card shrink-0 text-[11px]">
        <span className="text-muted-foreground font-mono truncate">
          {file.path.replace(`/${fileName}`, "")}/<span className="text-foreground font-semibold">{fileName}</span>
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={() => setViewed(!viewed)}
            className={cn("flex items-center gap-1.5 transition-colors", viewed ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <IconEye size={13} />
            <span>Viewed</span>
          </button>
          <button
            onClick={() => rawDiff && navigator.clipboard.writeText(rawDiff)}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            title="Copy diff"
          >
            <IconCopy size={13} />
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="font-mono text-[12px] leading-[1.65]">
            {lines.map((line, i) => {
              if (line.type === "hunk") {
                return (
                  <div key={i} className="flex items-center bg-blue-950/20 border-y border-blue-900/20 px-4 py-0.5">
                    <span className="text-blue-400/60 select-none text-[11px]">{line.text}</span>
                  </div>
                )
              }

              const isAdd = line.type === "add"
              const isDel = line.type === "del"
              const lineNum = line.lineNo ?? (isAdd ? addLineNo : delLineNo)
              if (isAdd) addLineNo++
              else if (isDel) delLineNo++
              else { addLineNo++; delLineNo++ }

              const isCommentActive = activeCommentLine === i

              return (
                <div key={i}>
                  {/* Diff line */}
                  <div
                    className={cn(
                      "flex items-stretch group cursor-pointer relative",
                      isAdd && "bg-emerald-950/25",
                      isDel && "bg-red-950/25",
                      isCommentActive && isAdd && "bg-emerald-950/40",
                      isCommentActive && isDel && "bg-red-950/40",
                      !isAdd && !isDel && "hover:bg-card/60"
                    )}
                    onClick={() => {
                      if (activeCommentLine === i) {
                        setActiveCommentLine(null)
                      } else {
                        setActiveCommentLine(i)
                      }
                    }}
                  >
                    {/* Left color bar */}
                    <div className={cn(
                      "w-0.5 shrink-0 self-stretch",
                      isAdd ? "bg-emerald-500/50" : isDel ? "bg-red-500/50" : "bg-transparent"
                    )} />

                    {/* Line number */}
                    <div className={cn(
                      "w-10 shrink-0 text-right pr-3 py-0.5 select-none text-[11px]",
                      isAdd ? "text-emerald-600/80" : isDel ? "text-red-500/80" : "text-muted-foreground/40"
                    )}>
                      {lineNum}
                    </div>

                    {/* Sign */}
                    <div className={cn(
                      "w-4 shrink-0 text-center py-0.5 select-none",
                      isAdd ? "text-emerald-500" : isDel ? "text-red-400" : "text-muted-foreground/20"
                    )}>
                      {isAdd ? "+" : isDel ? "−" : " "}
                    </div>

                    {/* Code */}
                    <div className={cn(
                      "flex-1 py-0.5 pl-2 pr-4 whitespace-pre overflow-hidden",
                      isAdd && "group-hover:bg-emerald-950/20",
                      isDel && "group-hover:bg-red-950/20"
                    )}>
                      {tokenize(line.text).map((tok, j) => (
                        <span key={j} className={tok.cls}>{tok.text}</span>
                      ))}
                    </div>

                    {/* Comment hint on hover */}
                    {!isCommentActive && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-muted-foreground/40 font-sans">+ comment</span>
                      </div>
                    )}
                  </div>

                  {/* Inline comment form */}
                  {isCommentActive && (
                    <CommentForm
                      onCancel={() => setActiveCommentLine(null)}
                      onSubmit={(text) => handleSubmitComment(i, text)}
                    />
                  )}

                  {/* Saved comments */}
                  {comments[i] && comments[i].length > 0 && (
                    <CommentThread comments={comments[i]} />
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
