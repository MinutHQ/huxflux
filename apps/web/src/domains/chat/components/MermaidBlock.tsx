import { useMemo } from "react"
import { PeleError, render } from "pele"

// Diagram source comes from the agent, which may itself be relaying untrusted
// text. Pele escapes labels and never emits scripts or event handlers, but an
// image URL would be fetched the moment the diagram is displayed, which is an
// exfiltration channel for anything the agent has in context. Diagrams do not
// need remote images, so they stay off.
const RENDER_OPTIONS = { images: false } as const

/**
 * A ```mermaid fence rendered to SVG by Pele. Colours come from the `.pele`
 * CSS variables in index.css, so a diagram follows the active theme and flips
 * with dark mode without re-rendering.
 *
 * Assistant messages stream in token by token, so the fence is incomplete for
 * most of its life and does not parse. Rather than flashing an error on every
 * diagram, an unparseable source falls back to the plain code block and
 * settles into the diagram once the closing fence arrives.
 */
export function MermaidBlock({ source }: { source: string }) {
  const svg = useMemo(() => {
    try {
      return render(source, RENDER_OPTIONS).svg
    } catch (err) {
      if (!(err instanceof PeleError)) throw err
      return null
    }
  }, [source])

  if (svg === null) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-secondary px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground/80">
        <code className="whitespace-pre">{source}</code>
      </pre>
    )
  }

  return (
    <div
      className="pele my-3 overflow-x-auto rounded-lg border border-border bg-secondary px-4 py-3 [&_svg]:max-w-full [&_svg]:h-auto"
      // Pele generates this markup from the diagram source; it escapes text and
      // emits no scripts, event handlers, or HTML labels. See the note above.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
