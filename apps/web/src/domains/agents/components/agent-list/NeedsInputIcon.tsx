import { IconMessageQuestion } from "@tabler/icons-react"

/**
 * Shown in place of the streaming dots / PR icon while the agent is parked on
 * an AskUserQuestion. The turn does not progress until the user opens the
 * agent and answers, so the row must read as "waiting on you", not "working".
 */
export function NeedsInputIcon({ question }: { question?: string }) {
  const hint = question
    ? `Waiting for your input: ${question.length > 80 ? `${question.slice(0, 80)}...` : question}`
    : "Waiting for your input"
  return (
    <span className="inline-flex shrink-0 text-amber-400" title={hint} aria-label="Waiting for your input">
      <IconMessageQuestion size={12} />
    </span>
  )
}
