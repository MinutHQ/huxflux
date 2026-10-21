import { useState } from "react"
import { buildQuestionAnswer, type QuestionDraft } from "@huxflux/shared"
import type { PendingQuestionEntry } from "../chat.types"

const emptyDraft: QuestionDraft = { selected: [], other: "" }

/** Per-question draft state for the AskUserQuestion card, keyed by question text. */
export function useQuestionDraft(questions: PendingQuestionEntry[]) {
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({})

  const draftFor = (q: PendingQuestionEntry): QuestionDraft => drafts[q.question] ?? emptyDraft
  const update = (q: PendingQuestionEntry, next: (d: QuestionDraft) => QuestionDraft) =>
    setDrafts((prev) => ({ ...prev, [q.question]: next(prev[q.question] ?? emptyDraft) }))

  /** Pick an option: replaces the choice (single) or toggles it (multi). */
  const choose = (q: PendingQuestionEntry, label: string) =>
    update(q, (d) => {
      if (!q.multiSelect) return { selected: [label], other: "" }
      const selected = d.selected.includes(label) ? d.selected.filter((l) => l !== label) : [...d.selected, label]
      return { ...d, selected }
    })

  /** Type free text: in single-select it replaces any chosen option. */
  const setOther = (q: PendingQuestionEntry, other: string) =>
    update(q, (d) => (q.multiSelect ? { ...d, other } : { selected: [], other }))

  const answerOf = (q: PendingQuestionEntry) => buildQuestionAnswer(q, draftFor(q))

  const buildAnswers = (): Record<string, string> =>
    Object.fromEntries(questions.map((q) => [q.question, answerOf(q)]))

  return { draftFor, choose, setOther, answerOf, buildAnswers }
}
