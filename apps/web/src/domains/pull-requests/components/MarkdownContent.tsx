import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { handleExternalClick } from "@/lib/platform"

/**
 * Tailwind-styled markdown renderer used for PR description, comments, and
 * thread bodies in the main document flow. Strips HTML comments before
 * rendering. Use `InlineMd` instead inside the `@pierre/diffs` shadow-DOM
 * slots — Tailwind classes do not penetrate the shadow root.
 */
export function MarkdownContent({ content }: { content: string }) {
  const cleaned = content.replace(/<!--[\s\S]*?-->/g, "").trim()
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        code: ({ children, className }) => {
          if (className?.includes("language-")) {
            return (
              <pre className="bg-secondary border border-border rounded-md px-3 py-2.5 overflow-x-auto mb-2">
                <code className="text-[12px] font-mono text-foreground">{children}</code>
              </pre>
            )
          }
          return (
            <code className="font-mono text-[12px] bg-secondary px-1 py-0.5 rounded text-foreground">
              {children}
            </code>
          )
        },
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 pl-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 pl-1">{children}</ol>,
        li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        h1: ({ children }) => <h1 className="text-[14px] font-bold text-foreground mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[13px] font-semibold text-foreground mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[12px] font-medium text-foreground mb-1 mt-2 first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="text-[12px] font-medium text-muted-foreground mb-1 mt-2 first:mt-0">{children}</h4>,
        details: ({ children }) => (
          <details className="mb-2 rounded border border-border bg-secondary/20 px-3 py-1.5 text-[12px]">{children}</details>
        ),
        summary: ({ children }) => (
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">{children}</summary>
        ),
        hr: () => <hr className="border-border my-3" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            className="text-blue-400 hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {cleaned}
    </ReactMarkdown>
  )
}
