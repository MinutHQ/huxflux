import { EditorView } from "@codemirror/view"
import { HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

/** Editor chrome on top of the app's CSS variables, so it follows the active palette. */
export const editorChrome = EditorView.theme({
  "&": { height: "100%", fontSize: "12px", backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace", lineHeight: "20px" },
  ".cm-content": { caretColor: "var(--foreground)", paddingBottom: "40vh" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "color-mix(in oklch, var(--muted-foreground) 70%, transparent)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 4px", minWidth: "32px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--accent) 40%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklch, var(--ring) 35%, transparent) !important",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--muted-foreground)", cursor: "pointer", padding: "0 2px" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--accent)", border: "none", color: "var(--muted-foreground)", padding: "0 4px" },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in oklch, var(--ring) 25%, transparent)", outline: "none" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, orange 25%, transparent)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in oklch, orange 50%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search": { fontSize: "12px", padding: "6px 8px" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": { fontSize: "12px" },
  ".cm-textfield": { backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--secondary)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--foreground)" },
  ".cm-comment-gutter .cm-gutterElement": { width: "18px", display: "flex", alignItems: "center", justifyContent: "center" },
  ".cm-comment-add": {
    width: "16px", height: "16px", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: "oklch(0.6 0.18 255)", color: "white", fontSize: "13px", lineHeight: "16px", cursor: "pointer",
  },
  ".cm-comment-dot": { width: "6px", height: "6px", borderRadius: "999px", backgroundColor: "oklch(0.6 0.18 255)" },
  ".cm-comment-widget": { padding: "4px 12px 4px 4px", fontFamily: "var(--font-sans)" },
})

/** Close to pierre's `vesper` so the editor and the diff read alike in dark mode. */
export const darkHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: "#A0A0A0" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#99FFE4" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.typeName, t.namespace], color: "#FFC799" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#FFC799" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#8B8B8B", fontStyle: "italic" },
  { tag: [t.tagName, t.attributeName], color: "#FFC799" },
  { tag: [t.heading], color: "#FFC799", fontWeight: "bold" },
  { tag: [t.link, t.url], color: "#99FFE4", textDecoration: "underline" },
  { tag: [t.punctuation, t.bracket, t.operator], color: "#A0A0A0" },
  { tag: t.invalid, color: "#FF8080" },
])

/** Close to `github-light`. */
export const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: "#cf222e" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#0a3069" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#8250df" },
  { tag: [t.className, t.typeName, t.namespace], color: "#953800" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#0550ae" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6e7781", fontStyle: "italic" },
  { tag: [t.tagName], color: "#116329" },
  { tag: [t.attributeName, t.propertyName], color: "#0550ae" },
  { tag: [t.heading], color: "#0550ae", fontWeight: "bold" },
  { tag: [t.link, t.url], color: "#0a3069", textDecoration: "underline" },
  { tag: t.invalid, color: "#82071e" },
])
