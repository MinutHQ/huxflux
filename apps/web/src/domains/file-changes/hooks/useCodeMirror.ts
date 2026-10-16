import { useEffect, useRef, useState } from "react"
import { Compartment, EditorState } from "@codemirror/state"
import {
  EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap, lineNumbers, rectangularSelection,
} from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import {
  LanguageDescription, bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { editorChrome, darkHighlight, lightHighlight } from "../components/files-pane/editor/editorTheme"
import { commentExtensions, type PortalRegistry } from "../components/files-pane/editor/commentExtensions"

interface UseCodeMirrorArgs {
  container: HTMLElement | null
  /** Starting text. The view is created once this is non-null. */
  initialDoc: string | null
  path: string
  readOnly: boolean
  dark: boolean
  registry: PortalRegistry
  onChange: (doc: string) => void
  onSave: () => void
  onAddComment: (line: number) => void
}

/**
 * Owns one CodeMirror view for the Files section editor: line numbers,
 * folding, search (Cmd+F), history, Mod-s save, a lazily loaded language
 * mode picked from the file name, and the line-comment gutter. Theme and
 * read-only flips reconfigure in place instead of rebuilding the view.
 */
export function useCodeMirror(args: UseCodeMirrorArgs): EditorView | null {
  const [view, setView] = useState<EditorView | null>(null)
  const handlers = useRef(args)
  useEffect(() => { handlers.current = args })
  const compartments = useRef({ language: new Compartment(), highlight: new Compartment(), readOnly: new Compartment() })
  const ready = args.initialDoc !== null

  useEffect(() => {
    if (!args.container || !ready) return
    const c = compartments.current
    const state = EditorState.create({
      doc: handlers.current.initialDoc ?? "",
      extensions: [
        commentExtensions(handlers.current.registry, (line) => handlers.current.onAddComment(line)),
        lineNumbers(),
        foldGutter(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => { handlers.current.onSave(); return true } },
          ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab,
        ]),
        editorChrome,
        c.highlight.of(syntaxHighlighting(handlers.current.dark ? darkHighlight : lightHighlight)),
        c.language.of([]),
        c.readOnly.of(EditorState.readOnly.of(handlers.current.readOnly)),
        EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()) }),
      ],
    })
    const v = new EditorView({ state, parent: args.container })
    setView(v)

    let cancelled = false
    const lang = LanguageDescription.matchFilename(languages, handlers.current.path)
    lang?.load().then((support) => {
      if (!cancelled) v.dispatch({ effects: c.language.reconfigure(support) })
    }).catch(() => { /* plain text it is */ })

    return () => {
      cancelled = true
      v.destroy()
      setView(null)
    }
  }, [args.container, ready])

  useEffect(() => {
    view?.dispatch({ effects: compartments.current.highlight.reconfigure(syntaxHighlighting(args.dark ? darkHighlight : lightHighlight)) })
  }, [view, args.dark])

  useEffect(() => {
    view?.dispatch({ effects: compartments.current.readOnly.reconfigure(EditorState.readOnly.of(args.readOnly)) })
  }, [view, args.readOnly])

  return view
}
