import { useCallback, useState } from "react"
import { buildQuestionAnswer, type AskQuestionEntry, type QuestionDraft } from "@huxflux/shared"

const emptyDraft: QuestionDraft = { selected: [], other: "" }

/** Per-question selection and free-text state for the question card. */
export function useAskQuestionForm(questions: AskQuestionEntry[]) {
  const [drafts, setDrafts] = useState<QuestionDraft[]>(() => questions.map(() => emptyDraft))

  const update = useCallback((index: number, fn: (d: QuestionDraft) => QuestionDraft) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? fn(d) : d)))
  }, [])

  const toggleOption = useCallback((index: number, label: string) => {
    const multi = !!questions[index]?.multiSelect
    update(index, (d) => {
      if (multi) {
        const selected = d.selected.includes(label) ? d.selected.filter((l) => l !== label) : [...d.selected, label]
        return { ...d, selected }
      }
      return { selected: [label], other: "" }
    })
  }, [questions, update])

  const setOther = useCallback((index: number, text: string) => {
    const multi = !!questions[index]?.multiSelect
    update(index, (d) => ({ selected: multi ? d.selected : [], other: text }))
  }, [questions, update])

  const answers = questions.map((q, i) => buildQuestionAnswer(q, drafts[i] ?? emptyDraft))
  const isAnswered = (index: number) => (answers[index] ?? "").length > 0
  const allAnswered = answers.every((a) => a.length > 0)

  function buildAnswerRecord(): Record<string, string> {
    const record: Record<string, string> = {}
    questions.forEach((q, i) => { record[q.question] = answers[i] ?? "" })
    return record
  }

  return { drafts, toggleOption, setOther, isAnswered, allAnswered, buildAnswerRecord }
}
