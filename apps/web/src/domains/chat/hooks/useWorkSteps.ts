import { useEffect, useMemo, useState } from "react"
import type { Message } from "@huxflux/shared"
import type { WorkStep } from "../chat.types"
import { currentTurnCalls } from "../extract/workSteps"

/**
 * The running turn's tool calls, each stamped with when the client first saw
 * it. Tool calls carry no timestamp of their own, so step durations are
 * measured from arrival to the next step's arrival.
 */
export function useWorkSteps(messages: Message[]): WorkStep[] {
  const calls = useMemo(() => currentTurnCalls(messages), [messages])
  const ids = calls.map((c) => c.id).join("\n")
  const [seen, setSeen] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(calls.map((c) => [c.id, null])),
  )

  useEffect(() => {
    if (!ids) return
    const now = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arrival time is only known once the call renders
    setSeen((prev) => {
      const fresh = ids.split("\n").filter((id) => !(id in prev))
      return fresh.length ? { ...prev, ...Object.fromEntries(fresh.map((id) => [id, now])) } : prev
    })
  }, [ids])

  return calls.map((call) => ({ call, at: seen[call.id] ?? null }))
}
