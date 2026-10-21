import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { cn, Button } from "@huxflux/ui"
import { IconCheck, IconMessageQuestion } from "@tabler/icons-react"
import type { PendingQuestionEntry } from "../chat.types"
import { useQuestionDraft } from "../hooks/useQuestionDraft"
import { QuestionOptions } from "./QuestionOptions"

interface AskUserQuestionCardProps {
  questions: PendingQuestionEntry[]
  /** Rejects when the answer did not reach the agent; the card then stays open. */
  onSubmit: (answers: Record<string, string>) => Promise<void> | void
  /** Drop the card locally (after an answer failed because the question is gone). */
  onDismiss: () => void
}

function StepDots({ questions, step, isAnswered }: { questions: PendingQuestionEntry[]; step: number; isAnswered: (q: PendingQuestionEntry) => boolean }) {
  return (
    <div className="flex justify-center gap-1 pb-2">
      {questions.map((q, i) => (
        <div
          key={q.question}
          className={cn(
            "w-1.5 h-1.5 rounded-full transition-colors",
            i === step ? "bg-foreground" : i < step && isAnswered(q) ? "bg-foreground/40" : "bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
  )
}

function FreeTextInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <input
      type="text"
      placeholder="Type your answer…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring"
      autoFocus
    />
  )
}

function ErrorRow({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 underline underline-offset-2 hover:opacity-80">Dismiss</button>
    </div>
  )
}

function CardFooter({ showBack, onBack, isLast, sending, canAdvance, onNext }: {
  showBack: boolean
  onBack: () => void
  isLast: boolean
  sending: boolean
  canAdvance: boolean
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-border">
      <div>
        {showBack && (
          <button type="button" onClick={onBack} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Back
          </button>
        )}
      </div>
      <Button size="sm" className="h-7 text-[11px] px-3 gap-1" disabled={!canAdvance} onClick={onNext}>
        {isLast ? (<><IconCheck size={12} />{sending ? "Sending…" : "Submit"}</>) : "Next"}
      </Button>
    </div>
  )
}

export function AskUserQuestionCard({ questions, onSubmit, onDismiss }: AskUserQuestionCardProps) {
  const [step, setStep] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft = useQuestionDraft(questions)
  const cardRef = useRef<HTMLDivElement>(null)

  // Take keyboard focus for the number shortcuts, but never steal it from
  // something the user is typing into (the composer, a terminal).
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) cardRef.current?.focus()
  }, [step])

  const q = questions[step]
  if (!q) return null
  const isLast = step === questions.length - 1
  const canAdvance = draft.answerOf(q).length > 0 && !sending

  async function submit() {
    setSending(true)
    setError(null)
    try {
      await onSubmit(draft.buildAnswers())
    } catch (err) {
      setError(err instanceof Error ? err.message : "The answer did not reach the agent")
      setSending(false)
    }
  }
  const next = () => {
    if (!canAdvance) return
    if (isLast) void submit()
    else setStep((s) => s + 1)
  }
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!q || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
    const option = /^[1-9]$/.test(e.key) ? q.options?.[Number(e.key) - 1] : undefined
    if (option) { e.preventDefault(); draft.choose(q, option.label) }
    else if (e.key === "Enter") { e.preventDefault(); next() }
  }

  return (
    <div ref={cardRef} tabIndex={-1} onKeyDown={handleKeyDown} className="mb-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm focus:outline-none">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <IconMessageQuestion size={13} className="text-amber-400 shrink-0" />
        <span className="text-[12px] font-medium text-foreground">The agent is waiting for your answer</span>
        {questions.length > 1 && <span className="text-[10px] font-mono text-muted-foreground ml-auto">{step + 1}/{questions.length}</span>}
      </div>
      <div className="px-3 py-3">
        {q.header && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{q.header}</p>}
        <p className="text-[13px] text-foreground mb-2.5">{q.question}</p>
        {q.multiSelect && <p className="-mt-1.5 mb-2 text-[11px] text-muted-foreground">Pick all that apply.</p>}
        {q.options && q.options.length > 0 ? (
          <QuestionOptions
            q={q}
            draft={draft.draftFor(q)}
            onChoose={(label) => draft.choose(q, label)}
            onOtherChange={(v) => draft.setOther(q, v)}
            onEnter={next}
          />
        ) : (
          <FreeTextInput value={draft.draftFor(q).other} onChange={(v) => draft.setOther(q, v)} onEnter={next} />
        )}
        {error && <ErrorRow message={error} onDismiss={onDismiss} />}
      </div>
      <CardFooter
        showBack={step > 0}
        onBack={() => setStep((s) => s - 1)}
        isLast={isLast}
        sending={sending}
        canAdvance={canAdvance}
        onNext={next}
      />
      {questions.length > 1 && <StepDots questions={questions} step={step} isAnswered={(x) => draft.answerOf(x).length > 0} />}
    </div>
  )
}
