import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { stripHtml } from "../utils"

/**
 * Renders a sanitized markdown comment body (PR thread / discussion comment).
 * HTML tags are stripped to keep the layout calm; fenced code blocks are
 * preserved.
 */
export function MarkdownComment({ body }: { body: string }) {
  return (
    <div
      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      className="text-[12px] text-muted-foreground leading-relaxed max-w-none min-w-0 w-full overflow-hidden [&_p]:my-1 [&_pre]:my-1.5 [&_pre]:text-[11px] [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_code]:text-[11px] [&_code]:whitespace-pre-wrap [&_code]:break-all [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_table]:w-full [&_table]:table-fixed [&_table]:text-[11px] [&_table]:overflow-x-auto [&_table]:block [&_td]:break-all [&_th]:break-all"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripHtml(body)}</ReactMarkdown>
    </div>
  )
}
