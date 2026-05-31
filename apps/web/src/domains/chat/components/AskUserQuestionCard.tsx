import { useState } from "react"
import { cn, Button } from "@huxflux/ui"
import { IconCheck, IconMessageCircle } from "@tabler/icons-react"
import type { PendingQuestionEntry } from "../chat.types"

interface AskUserQuestionCardProps {
  questions: PendingQuestionEntry[]
  onSubmit: (answers: Record<string, string>) => void
}

interface QuestionOptionsProps {
  q: PendingQuestionEntry
  answers: Record<string, string>
  setAnswers: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  isLast: boolean
  onAdvance: () => void
  onSubmit: () => void
}

function QuestionOptions({ q, answers, setAnswers, isLast, onAdvance, onSubmit }: QuestionOptionsProps) {
  const currentAnswer = (answers[q.question] ?? "").trim()
  const options = q.options ?? []
  const otherSelected = answers[q.question] && !options.some((o) => o.label === answers[q.question])

  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => {
            setAnswers((prev) => ({ ...prev, [q.question]: opt.label }))
            if (!isLast) setTimeout(onAdvance, 200)
          }}
          className={cn(
            "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors text-[12px]",
            answers[q.question] === opt.label
              ? "border-blue-400/50 bg-blue-500/10 text-foreground"
              : "border-border bg-card hover:bg-accent text-foreground/80"
          )}
        >
          <div className={cn(
            "w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
            answers[q.question] === opt.label ? "border-blue-400 bg-blue-400" : "border-muted-foreground/30"
          )}>
            {answers[q.question] === opt.label && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
          </div>
          <div>
            <span className="font-medium">{opt.label}</span>
            {opt.description && <span className="text-muted-foreground/60 ml-1.5">{opt.description}</span>}
          </div>
        </button>
      ))}
      {/* "Other" option with free text input */}
      <div className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors text-[12px]",
        otherSelected ? "border-blue-400/50 bg-blue-500/10 text-foreground" : "border-border bg-card text-foreground/80"
      )}>
        <div className={cn(
          "w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-1.5 flex items-center justify-center transition-colors",
          otherSelected ? "border-blue-400 bg-blue-400" : "border-muted-foreground/30"
        )}>
          {otherSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
        <input
          type="text"
          placeholder="Other..."
          value={otherSelected ? (answers[q.question] ?? "") : ""}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.question]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && currentAnswer) {
              if (isLast) onSubmit()
              else onAdvance()
            }
          }}
          className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
      </div>
    </div>
  )
}

export function AskUserQuestionCard({ questions, onSubmit }: AskUserQuestionCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)

  const total = questions.length
  const q = questions[step]
  const currentAnswer = q ? (answers[q.question] ?? "").trim() : ""
  const isLast = step === total - 1

  if (!q) return null

  const advance = () => setStep((s) => s + 1)
  const submit = () => onSubmit(answers)

  return (
    <div className="mb-3 rounded-xl border border-blue-400/30 bg-blue-500/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-400/20 bg-blue-500/5">
        <IconMessageCircle size={13} className="text-blue-400 shrink-0" />
        <span className="text-[12px] font-medium text-blue-400/90">Claude is asking a question</span>
        {total > 1 && (
          <span className="text-[10px] font-mono text-blue-400/50 ml-auto">{step + 1}/{total}</span>
        )}
      </div>
      <div className="px-3 py-3">
        {q.header && <p className="text-[11px] font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">{q.header}</p>}
        <p className="text-[13px] text-foreground mb-2.5">{q.question}</p>
        {q.options && q.options.length > 0 ? (
          <QuestionOptions q={q} answers={answers} setAnswers={setAnswers} isLast={isLast} onAdvance={advance} onSubmit={submit} />
        ) : (
          <input
            type="text"
            placeholder="Type your answer…"
            value={answers[q.question] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.question]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && currentAnswer) {
                if (isLast) submit()
                else advance()
              }
            }}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
            autoFocus
          />
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-blue-400/20">
        <div>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Back
            </button>
          )}
        </div>
        <Button
          size="sm"
          className="h-7 text-[11px] px-3 gap-1"
          disabled={!currentAnswer}
          onClick={() => { if (isLast) submit(); else advance() }}
        >
          {isLast ? (<><IconCheck size={12} />Submit</>) : "Next"}
        </Button>
      </div>
      {/* Step dots */}
      {total > 1 && (
        <div className="flex justify-center gap-1 pb-2">
          {questions.map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === step ? "bg-blue-400" : i < step && answers[questions[i].question] ? "bg-blue-400/40" : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
