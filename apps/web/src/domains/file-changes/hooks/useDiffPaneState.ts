import { useCallback, useMemo } from "react"
import type { DiffBase } from "@huxflux/shared"
import { usePersistentState } from "@/hooks/usePersistentState"

function isBase(raw: unknown): raw is DiffBase {
  return raw === "branch" || raw === "uncommitted"
}

function isStyle(raw: unknown): raw is "unified" | "split" {
  return raw === "unified" || raw === "split"
}

function isStringArray(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every((x) => typeof x === "string")
}

/**
 * Persisted diff-pane preferences. Base mode and collapsed files are per
 * agent; diff style, tree and diff-body visibility are global.
 */
export function useDiffPaneState(agentId: string) {
  const [base, setBase] = usePersistentState<DiffBase>(`huxflux:diff:base:${agentId}`, "branch", isBase)
  const [diffStyle, setDiffStyle] = usePersistentState<"unified" | "split">("huxflux:diff:style", "unified", isStyle)
  const [treeVisible, setTreeVisible] = usePersistentState("huxflux:diff:tree-visible", true, (r): r is boolean => typeof r === "boolean")
  // When false only the changed-files tree shows; clicking a file brings the diff back.
  const [diffVisible, setDiffVisible] = usePersistentState("huxflux:diff:body-visible", true, (r): r is boolean => typeof r === "boolean")
  const [collapsedList, setCollapsedList] = usePersistentState<string[]>(`huxflux:diff:collapsed:${agentId}`, [], isStringArray)

  const collapsed = useMemo(() => new Set(collapsedList), [collapsedList])

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsedList((list) => (list.includes(path) ? list.filter((p) => p !== path) : [...list, path]))
  }, [setCollapsedList])

  const expand = useCallback((path: string) => {
    setCollapsedList((list) => (list.includes(path) ? list.filter((p) => p !== path) : list))
  }, [setCollapsedList])

  return {
    base, setBase,
    diffStyle, setDiffStyle,
    treeVisible, setTreeVisible,
    diffVisible, setDiffVisible,
    collapsed, toggleCollapsed, expand,
    collapseAll: (paths: string[]) => setCollapsedList(paths),
    expandAll: () => setCollapsedList([]),
  }
}
