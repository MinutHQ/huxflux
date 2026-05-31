/**
 * Inline styles for the inline-comment slots rendered by `@pierre/diffs`.
 *
 * These have to be plain CSS object styles (not Tailwind classes) because
 * the diff library mounts annotation content in a shadow DOM, where Tailwind
 * classes do not penetrate.
 */
export const SLOT_STYLES = {
  card: {
    padding: "8px 12px",
    background: "rgba(59,130,246,0.04)",
    borderRadius: 8,
    margin: "4px 8px",
    fontFamily: "system-ui, sans-serif",
    overflowWrap: "anywhere" as const,
    wordBreak: "break-word" as const,
    overflow: "hidden" as const,
    minWidth: 0,
    maxWidth: "100%",
  } as const,
  textarea: {
    width: "100%",
    fontSize: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "inherit",
    resize: "none" as const,
    overflow: "hidden" as const,
    outline: "none",
  } as const,
  btnPrimary: {
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 4,
    background: "var(--primary, #3b82f6)",
    color: "white",
    border: "none",
    cursor: "pointer",
  } as const,
  btnGhost: {
    fontSize: 11,
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
  } as const,
  btnDanger: {
    fontSize: 11,
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.25)",
    cursor: "pointer",
  } as const,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  } as const,
}
