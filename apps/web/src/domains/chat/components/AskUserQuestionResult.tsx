import type { ReactNode } from "react"
import { parseAskAnswers } from "@huxflux/shared"
import type { PendingQuestionEntry } from "../chat.types"

function parseQuestions(args: string | undefined): PendingQuestionEntry[] {
  if (!args) return []
  try {
    const parsed = JSON.parse(args) as { questions?: unknown }
    return Array.isArray(parsed.questions) ? (parsed.questions as PendingQuestionEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Each question of a finished AskUserQuestion call next to the user's answer,
 * read back from the tool result. Renders `fallback` (the raw result) when the
 * result does not carry the answers: denied, errored, or cancelled.
 */
export function AskUserQuestionResult({ args, result, fallback }: { args?: string; result: string; fallback: ReactNode }) {
  const questions = parseQuestions(args)
  const answers = parseAskAnswers(result, questions)
  if (!answers) return <>{fallback}</>
  return (
    <div className="mt-1 ml-4 space-y-1 border-l border-border/60 pl-3">
      {questions.map((q) => (
        <div key={q.question} className="text-[12px] leading-snug">
          <div className="text-muted-foreground">{q.question}</div>
          {answers[q.question] !== undefined
            ? <div className="text-foreground/90 font-medium">{answers[q.question]}</div>
            : <div className="text-muted-foreground/60 italic">No answer</div>}
        </div>
      ))}
    </div>
  )
}
