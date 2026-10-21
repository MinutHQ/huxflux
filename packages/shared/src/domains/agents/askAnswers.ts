// Helpers for the AskUserQuestion round trip shared by every client.
//
// Answers travel as `Record<question text, answer string>`, the shape Claude's
// AskUserQuestion tool expects in `updatedInput.answers`. A multi-select
// question gets its chosen labels joined with ", " (the same encoding the
// Claude Code terminal UI uses).

/** Separator Claude Code uses between the labels of a multi-select answer. */
export const MULTI_SELECT_SEPARATOR = ", "

/**
 * Encode a multi-select answer: chosen labels in option order, then free text.
 * A label that itself contains ", " or a quote is JSON-quoted so the CLI can
 * split the list back into labels (its own encoder does the same).
 */
export function joinMultiSelectAnswer(labels: string[], other?: string): string {
  const parts = labels
    .filter((l) => l.trim().length > 0)
    .map((l) => (l.includes(MULTI_SELECT_SEPARATOR) || l.includes(`"`) ? JSON.stringify(l) : l))
  const extra = other?.trim()
  if (extra) parts.push(extra)
  return parts.join(MULTI_SELECT_SEPARATOR)
}

/** What the user has picked so far for one question on the card. */
export interface QuestionDraft {
  selected: string[]
  other: string
}

/**
 * The answer string sent for one question. Single-select sends the chosen
 * label, else the free text (the cards clear one when the other is set).
 * Multi-select sends the chosen labels in option order plus any free text.
 */
export function buildQuestionAnswer(
  question: { multiSelect?: boolean; options?: Array<{ label: string }> },
  draft: QuestionDraft,
): string {
  const labels = (question.options ?? []).map((o) => o.label).filter((l) => draft.selected.includes(l))
  if (question.multiSelect) return joinMultiSelectAnswer(labels, draft.other)
  return labels[0] ?? draft.other.trim()
}

/**
 * Recover the user's answers from the AskUserQuestion tool result text, so a
 * finished question can be shown with its answers in the transcript.
 *
 * The Claude CLI writes each answered question as `"Q"="A"`, joins them with
 * ", " and wraps them in a sentence ("Your questions have been answered: ...
 * You can now continue ..."). Questions the user skipped are left out.
 * Answers may contain quotes, so instead of a regex this walks the known
 * question texts in order: each answer runs up to the closing quote before the
 * next question's marker, and the last one up to the final quote in the text.
 * Returns only the questions found; null when none are (denied, errored, or a
 * format this parser does not know).
 */
export function parseAskAnswers(result: string, questions: Array<{ question: string }>): Record<string, string> | null {
  const found: Array<{ question: string; markerAt: number; valueAt: number }> = []
  let from = 0
  for (const q of questions) {
    const marker = `"${q.question}"="`
    const at = result.indexOf(marker, from)
    if (at === -1) continue
    found.push({ question: q.question, markerAt: at, valueAt: at + marker.length })
    from = at + marker.length
  }
  if (found.length === 0) return null
  const answers: Record<string, string> = {}
  for (let i = 0; i < found.length; i++) {
    const cur = found[i]
    if (!cur) continue
    const next = found[i + 1]
    const end = next ? result.lastIndexOf(`"`, next.markerAt - 1) : result.lastIndexOf(`"`)
    if (end < cur.valueAt) return null
    answers[cur.question] = result.slice(cur.valueAt, end)
  }
  return answers
}
