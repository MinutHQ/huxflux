import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { handleExternalClick } from "@/lib/platform"

/**
 * Markdown renderer safe for shadow-DOM slots produced by `@pierre/diffs`.
 * Uses inline styles, since Tailwind classes do not penetrate the shadow
 * root. Use `MarkdownContent` for normal document-flow rendering.
 */
export function InlineMd({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p style={{ margin: "0 0 4px", lineHeight: 1.5 }}>{children}</p>,
        code: ({ children, className }) => {
          if (className?.includes("language-")) {
            return (
              <pre
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 4,
                  padding: "6px 8px",
                  overflow: "auto",
                  margin: "4px 0",
                  fontSize: 11,
                }}
              >
                <code>{children}</code>
              </pre>
            )
          }
          return (
            <code style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: 3 }}>
              {children}
            </code>
          )
        },
        ul: ({ children }) => <ul style={{ margin: "2px 0", paddingLeft: 16 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "2px 0", paddingLeft: 16 }}>{children}</ol>,
        li: ({ children }) => <li style={{ fontSize: 12, lineHeight: 1.5 }}>{children}</li>,
        strong: ({ children }) => (
          <strong style={{ fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>{children}</strong>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleExternalClick}
            style={{ color: "rgb(96,165,250)", textDecoration: "none" }}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote
            style={{
              borderLeft: "2px solid rgba(255,255,255,0.15)",
              paddingLeft: 8,
              margin: "4px 0",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {children}
          </blockquote>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
