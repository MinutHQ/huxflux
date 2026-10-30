import { cn } from "@huxflux/ui"
import type { Message } from "@huxflux/shared"
import type { FinishedStep, WorkStepLabel } from "../chat.types"
import { describeWorkStep, formatWorkClock } from "../extract/workSteps"
import { useWorkSteps } from "../hooks/useWorkSteps"
import { WorkComet, WorkOrb } from "./WorkingEffects"
import { WorkStepIcon } from "./WorkStepIcon"
import { WorkTrail } from "./WorkTrail"

const thinking: WorkStepLabel = { kind: "other", text: "Thinking", code: false }

/**
 * What the agent is doing right now, under the last message. A lit card with
 * the live step (an orb with sparks circling it, the step with a sheen running
 * across it, a comet sweeping the bottom edge), and under it the trail of
 * every step the turn has already taken.
 */
export function WorkingIndicator({ messages, elapsedSeconds }: { messages: Message[]; elapsedSeconds: number }) {
  const steps = useWorkSteps(messages)
  const last = steps.at(-1)
  // A call with its result back means the model is thinking about what to do next.
  const live = last && !last.call.result ? last : undefined
  const label = live ? describeWorkStep(live.call) : thinking
  const finishedCount = live ? steps.length - 1 : steps.length
  const done: FinishedStep[] = steps
    .slice(0, finishedCount)
    .map((step, i) => {
      const next = steps[i + 1]?.at ?? null
      return { step, took: step.at !== null && next !== null ? next - step.at : null }
    })
    .reverse()

  return (
    <div className="mb-5 mt-0.5" role="status" aria-label="Working">
      <div className="work-card">
        <div className="relative flex items-center gap-2.5 pl-2 pr-3 py-2 overflow-hidden">
          <WorkOrb />
          <LiveStep key={live?.call.id ?? "thinking"} label={label} />
          <div className="ml-auto pl-2 flex items-center gap-2 shrink-0">
            {steps.length > 1 && (
              <span className="rounded-full bg-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
                step {steps.length}
              </span>
            )}
            {elapsedSeconds >= 3 && (
              <span className="text-[10.5px] font-medium tabular-nums text-muted-foreground/60">
                {formatWorkClock(elapsedSeconds)}
              </span>
            )}
          </div>
          <WorkComet />
        </div>
        {done.length > 0 && <WorkTrail done={done} total={steps.length} />}
      </div>
    </div>
  )
}

/** The step in flight: it rises into place each time a new one starts. */
function LiveStep({ label }: { label: WorkStepLabel }) {
  return (
    <div className="work-rise flex items-center gap-2 min-w-0">
      {label.verb && (
        <span className="flex items-center gap-1 shrink-0 text-[11px] font-semibold text-foreground">
          <WorkStepIcon kind={label.kind} size={12} />
          {label.verb}
        </span>
      )}
      <span
        className={cn(
          "text-shimmer work-step-sheen truncate min-w-0",
          label.code ? "font-mono text-[11.5px] font-medium" : "text-[12px]",
        )}
      >
        {label.text}
      </span>
    </div>
  )
}
