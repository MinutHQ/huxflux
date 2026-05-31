import { useCallback, useEffect, useState } from "react"
import { api } from "@huxflux/shared"
import type { WrappedLength, WrappedPeriod } from "./homeUtils"

interface UseWrappedSummary {
  period: WrappedPeriod
  setPeriod: (p: WrappedPeriod) => void
  length: WrappedLength
  setLength: (l: WrappedLength) => void
  customFrom: string
  setCustomFrom: (s: string) => void
  customTo: string
  setCustomTo: (s: string) => void
  summary: string | null
  loading: boolean
  error: string | null
  submitCustom: () => void
  regenerate: () => void
  retry: () => void
}

/**
 * Owns the fetch + state for the "Wrapped" AI summary card. Re-fetches when
 * `period` or `length` change (except for `custom` which waits for the user
 * to fill both dates and click Generate). `regenerate` keeps the existing
 * summary visible (dimmed) instead of clearing it, so the user always has
 * something to read.
 */
export function useWrappedSummary(): UseWrappedSummary {
  const [period, setPeriod] = useState<WrappedPeriod>("wtd")
  const [length, setLength] = useState<WrappedLength>("medium")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWrapped = useCallback(async (p: WrappedPeriod, len: WrappedLength, from?: string, to?: string, refresh?: boolean) => {
    if (p === "custom" && (!from || !to)) return
    setLoading(true)
    setError(null)
    // Keep the existing summary visible (dimmed) during regenerate; only
    // clear for a first-time fetch so the skeleton can show.
    if (!refresh) setSummary(null)
    try {
      // fire-and-forget; intentional: imperative summary fetch with stateful refresh flag, doesn't fit useHuxfluxQuery's keyed model
      // eslint-disable-next-line no-restricted-syntax
      const result = await api.wrapped.current(p, from, to, refresh, len)
      setSummary(result.summary)
    } catch (err) {
      setError((err as Error).message || "Failed to generate summary")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (period !== "custom") {
      fetchWrapped(period, length)
    } else if (customFrom && customTo) {
      fetchWrapped("custom", length, customFrom, customTo)
    }
    // Custom dates have their own explicit submit button, so they're not
    // in the dep list — the effect only auto-fires for preset periods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, length, fetchWrapped])

  const submitCustom = useCallback(() => {
    if (customFrom && customTo) {
      fetchWrapped("custom", length, customFrom, customTo)
    }
  }, [customFrom, customTo, length, fetchWrapped])

  const regenerate = useCallback(() => {
    if (period === "custom") {
      if (customFrom && customTo) fetchWrapped("custom", length, customFrom, customTo, true)
    } else {
      fetchWrapped(period, length, undefined, undefined, true)
    }
  }, [period, length, customFrom, customTo, fetchWrapped])

  const retry = useCallback(() => {
    fetchWrapped(
      period,
      length,
      period === "custom" ? customFrom : undefined,
      period === "custom" ? customTo : undefined,
    )
  }, [period, length, customFrom, customTo, fetchWrapped])

  return {
    period, setPeriod,
    length, setLength,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    summary, loading, error,
    submitCustom, regenerate, retry,
  }
}
