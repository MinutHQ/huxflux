import { useEffect, useState, useSyncExternalStore } from "react"
import { codeToHtml, getFiletypeFromFileName } from "@pierre/diffs"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { getDiffTheme } from "../getDiffTheme"
import { FileContentViewHeader } from "./FileContentViewHeader"

interface FileContentViewProps {
  agentId: string
  filePath: string
}

function useThemeName() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("huxflux:theme-change", cb)
      return () => window.removeEventListener("huxflux:theme-change", cb)
    },
    getDiffTheme,
    () => "vesper" as const,
  )
}

/**
 * Read-only file content viewer with shiki syntax highlighting via
 * `@pierre/diffs`. Mirrors main's behaviour: no edit/save, theme tracks the
 * user's resolved theme via the `huxflux:theme-change` event.
 */
export function FileContentView({ agentId, filePath }: FileContentViewProps) {
  const theme = useThemeName()
  const fileName = filePath.split("/").pop() ?? filePath
  const lang = getFiletypeFromFileName(fileName) ?? "text"

  const { data: content } = useHuxfluxQuery({
    queryKey: queryKeys.agents.fileContent(agentId, filePath),
    queryFn: () => api.agents.fileContent(agentId, filePath),
    staleTime: 10_000,
  })

  const [html, setHtml] = useState("")
  useEffect(() => {
    if (!content) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale highlight when content unloads
      setHtml("")
      return
    }
    let cancelled = false
    codeToHtml(content, { lang, theme }).then((next) => {
      // setState here lands in a promise microtask, after the effect returns,
      // not synchronously during render.
      if (!cancelled) setHtml(next)
    }).catch(() => { /* unsupported lang or shiki failure: render as plain text below */ })
    return () => { cancelled = true }
  }, [content, lang, theme])

  return (
    <div className="flex flex-col h-full">
      <FileContentViewHeader filePath={filePath} content={content} />
      <div className="flex-1 min-h-0 overflow-auto">
        {html ? (
          <div
            className="font-mono text-[12px] leading-[1.65] [&_pre]:p-3 [&_pre]:bg-transparent"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : content ? (
          <pre className="font-mono text-[12px] leading-[1.65] p-3 whitespace-pre">{content}</pre>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
