import React, { useState, useRef } from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { handleExternalClick } from "@/lib/platform"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TableBlock({ children }: { node?: any; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)

  function copyTable() {
    if (!tableRef.current) return
    const rows = Array.from(tableRef.current.rows).map((row) =>
      Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? "")
    )
    if (rows.length === 0) return
    const [header, ...body] = rows
    const sep = header.map(() => "---")
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...body.map((r) => `| ${r.join(" | ")} |`),
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative my-4 group">
      <button
        onClick={copyTable}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] text-muted-foreground hover:text-foreground z-10"
      >
        {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table ref={tableRef} className="w-full text-[13px] border-collapse">{children}</table>
      </div>
    </div>
  )
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const isBlock = className?.startsWith("language-")
  if (isBlock) {
    return (
      <code className="block font-mono text-[12px] bg-secondary border border-border rounded-lg px-4 py-3 my-3 overflow-x-auto text-foreground/80 leading-relaxed whitespace-pre">
        {children}
      </code>
    )
  }
  return (
    <code className="font-mono text-[12px] bg-secondary border border-border px-1.5 py-0.5 rounded text-foreground">
      {children}
    </code>
  )
}

export const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: CodeBlock,
        pre: ({ children }) => <>{children}</>,
        h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-4 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-outside ml-4 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-outside ml-4 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 text-muted-foreground my-3">{children}</blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleExternalClick} className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
            {children}
          </a>
        ),
        hr: () => <hr className="border-border my-4" />,
        table: ({ node, children }) => <TableBlock node={node}>{children}</TableBlock>,
        thead: ({ children }) => <thead className="border-b border-border bg-secondary/40">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border/50">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-accent/20 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground/70 uppercase tracking-wide whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-foreground/80 leading-relaxed">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
})
