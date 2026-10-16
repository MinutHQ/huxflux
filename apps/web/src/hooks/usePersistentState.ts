import { useCallback, useState, type Dispatch, type SetStateAction } from "react"

function read<T>(key: string, fallback: T, isValid?: (raw: unknown) => raw is T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (isValid && !isValid(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the state still works for this session */
  }
}

/**
 * `useState` backed by a localStorage JSON entry. When `key` changes (e.g. a
 * per-agent key on agent switch) the value is re-read for the new key during
 * render. Storage failures fall back to in-memory state.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid?: (raw: unknown) => raw is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(() => ({ key, value: read(key, fallback, isValid) }))
  let current = state
  if (state.key !== key) {
    current = { key, value: read(key, fallback, isValid) }
    setState(current)
  }

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setState((prev) => {
      const value = typeof next === "function" ? (next as (p: T) => T)(prev.value) : next
      write(prev.key, value)
      return { key: prev.key, value }
    })
  }, [])

  return [current.value, set]
}
