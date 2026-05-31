import { cn } from "@huxflux/ui"
import { IconFlask } from "@tabler/icons-react"
import type { Repo } from "@huxflux/shared"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import type { RefineMessage } from "../../tasks.types"
import { RepoSelector } from "./RepoSelector"

export function MessageBubble({
  msg,
  repos,
  selectedRepos,
  onReposChange,
  onReposConfirm,
  reposConfirmed,
}: {
  msg: RefineMessage
  repos: Repo[]
  selectedRepos: string[]
  onReposChange: (ids: string[]) => void
  onReposConfirm: () => void
  reposConfirmed: boolean
}) {
  const isAgent = msg.role === "agent"
  return (
    <div
      className={cn("flex gap-2", isAgent ? "items-start" : "items-start flex-row-reverse")}
    >
      {isAgent && (
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <IconFlask size={11} className="text-primary" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed",
          isAgent
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm",
        )}
      >
        {isAgent ? (
          <>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              }}
            >
              {msg.content}
            </ReactMarkdown>
            {msg.type === "repo-select" && (
              <RepoSelector
                repos={repos}
                selected={selectedRepos}
                onChange={onReposChange}
                onConfirm={onReposConfirm}
                confirmed={reposConfirmed}
              />
            )}
          </>
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
      </div>
    </div>
  )
}
