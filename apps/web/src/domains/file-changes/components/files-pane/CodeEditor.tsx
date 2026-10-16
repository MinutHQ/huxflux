import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { EditorView } from "@codemirror/view"
import { Button } from "@huxflux/ui"
import type { PRComment } from "@huxflux/shared"
import { useCodeMirror } from "../../hooks/useCodeMirror"
import { useDiffTheme } from "../../hooks/useDiffTheme"
import type { useFileBuffer } from "../../hooks/useFileBuffer"
import { InlineCommentBubble } from "../InlineCommentBubble"
import { InlineCommentForm } from "../InlineCommentForm"
import { PortalRegistry, setCommentLines, setCommentWidgets } from "./editor/commentExtensions"

interface CodeEditorProps {
  path: string
  buffer: ReturnType<typeof useFileBuffer>
  readOnly: boolean
  jump?: { line: number; nonce: number }
  comments: PRComment[]
  onAddComment: (c: PRComment) => void
  onRemoveComment: (id: string) => void
  onView?: (view: EditorView | null) => void
}

/** CodeMirror editor for one file plus its inline comment widgets and on-disk conflict banner. */
export function CodeEditor({ path, buffer, readOnly, jump, comments, onAddComment, onRemoveComment, onView }: CodeEditorProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [registry] = useState(() => new PortalRegistry())
  const [formLine, setFormLine] = useState<number | null>(null)
  const [formText, setFormText] = useState("")
  const formRef = useRef<HTMLTextAreaElement>(null)
  const dark = useDiffTheme() === "vesper"
  const fileName = path.split("/").pop() ?? path

  const view = useCodeMirror({
    container, initialDoc: buffer.initialDoc, path, readOnly, dark, registry,
    onChange: buffer.onChange,
    // A forced binary view is read-only: saving its lossy text decode would corrupt the file.
    onSave: readOnly ? () => {} : buffer.saveNow,
    onAddComment: (line) => { setFormLine(line); setFormText(""); setTimeout(() => formRef.current?.focus(), 30) },
  })

  useEffect(() => { onView?.(view) }, [view, onView])

  // Restore the scroll position from the last visit, and remember it on scroll.
  useEffect(() => {
    if (!view) return
    const el = view.scrollDOM
    requestAnimationFrame(() => { el.scrollTop = buffer.initialScrollTop })
    const onScroll = () => buffer.onScroll(el.scrollTop)
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  // Only on view creation: the initial scroll position is read once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Apply a clean reload from disk without rebuilding the view.
  useEffect(() => {
    if (!view || buffer.pendingReload === null) return
    if (view.state.doc.toString() !== buffer.pendingReload) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: buffer.pendingReload } })
    }
    buffer.consumeReload()
  }, [view, buffer])

  // Keyed on the request nonce, not the object, so parent re-renders do not move the cursor back.
  const jumpNonce = jump?.nonce
  const jumpLine = jump?.line
  useEffect(() => {
    if (!view || jumpLine === undefined) return
    const line = view.state.doc.line(Math.max(1, Math.min(jumpLine, view.state.doc.lines)))
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) })
    view.focus()
  }, [view, jumpNonce, jumpLine])

  const fileComments = useMemo(() => comments.filter((c) => c.path === path && c.line), [comments, path])
  const specs = useMemo(() => [
    ...fileComments.map((c) => ({ key: `c:${c.id}`, line: c.line ?? 1 })),
    ...(formLine !== null ? [{ key: "form", line: formLine }] : []),
  ], [fileComments, formLine])

  useEffect(() => {
    view?.dispatch({ effects: [setCommentWidgets.of(specs), setCommentLines.of(fileComments.map((c) => c.line ?? 1))] })
  }, [view, specs, fileComments])

  const portals = useSyncExternalStore(registry.subscribe, registry.getSnapshot)
  useLayoutEffect(() => { view?.requestMeasure() }, [view, portals, formText])

  function submit() {
    if (!formText.trim() || formLine === null) return
    onAddComment({
      id: `inline-${Date.now()}`, author: "You", body: formText.trim(), createdAt: new Date().toISOString(),
      url: "", isReply: false, path, line: formLine,
    })
    setFormLine(null)
    setFormText("")
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {buffer.conflict && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-accent/40 text-[12px] shrink-0">
          <span className="flex-1 text-foreground">This file changed on disk while you were editing.</span>
          <Button variant="ghost" size="xs" onClick={buffer.reloadFromDisk}>Reload</Button>
          <Button variant="outline" size="xs" onClick={buffer.keepMine}>Keep mine</Button>
        </div>
      )}
      <div ref={setContainer} className="flex-1 min-h-0 overflow-hidden" />
      {[...portals.entries()].map(([key, el]) => {
        if (key === "form") {
          return createPortal(
            <InlineCommentForm
              ref={formRef}
              fileName={fileName}
              lineNumber={formLine ?? 1}
              text={formText}
              onChangeText={setFormText}
              onSubmit={submit}
              onCancel={() => { setFormLine(null); setFormText("") }}
            />,
            el, key,
          )
        }
        const comment = fileComments.find((c) => `c:${c.id}` === key)
        return comment ? createPortal(<InlineCommentBubble comment={comment} onRemoveComment={onRemoveComment} />, el, key) : null
      })}
    </div>
  )
}
