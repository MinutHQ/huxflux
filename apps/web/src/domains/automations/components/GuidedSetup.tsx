import { useState } from "react"
import { ScrollArea } from "@huxflux/ui"
import type { AutomationStep } from "@huxflux/shared"
import { EVENT_OPTIONS } from "../constants"
import type { MockQuestion, SetupPhase } from "../automations.types"
import { TriggerStep, DescribeStep, BuildingProgress, QuestionStep } from "./GuidedSetupSteps"

interface GuidedSetupProps {
  onComplete: (config: {
    trigger: string
    triggerConfig: Record<string, string>
    description: string
    steps: AutomationStep[]
  }) => void
  onInitChat: (msg: string) => void
}

function buildGeneratedSteps(
  trigger: string,
  triggerConfig: { interval: string; eventType: string },
  questions: MockQuestion[],
): AutomationStep[] {
  const triggerLabel =
    trigger === "schedule" ? `Every ${triggerConfig.interval}`
    : trigger === "event" ? EVENT_OPTIONS.find(e => e.value === triggerConfig.eventType)?.label ?? "System event"
    : "Manual trigger"

  return [
    { id: "t1", type: "trigger", label: triggerLabel, config: { trigger, interval: triggerConfig.interval, eventType: triggerConfig.eventType }, position: { x: 0, y: 0 }, connections: ["a1"] },
    { id: "a1", type: "fetch", label: "Fetch data", config: { url: questions[0]?.answer ?? "" }, position: { x: 0, y: 1 }, connections: ["a2"] },
    { id: "a2", type: "parse", label: "Extract information", config: {}, position: { x: 0, y: 2 }, connections: ["a3"] },
    { id: "a3", type: "compare", label: "Check for changes", config: {}, position: { x: 0, y: 3 }, connections: ["a4"] },
    { id: "a4", type: "notify", label: questions[1]?.answer ?? "Notify", config: { method: questions[1]?.answer ?? "in-app" }, position: { x: 0, y: 4 }, connections: [] },
  ]
}

export function GuidedSetup({ onComplete }: GuidedSetupProps) {
  const [phase, setPhase] = useState<SetupPhase>("trigger")
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null)
  const [interval, setInterval] = useState("1h")
  const [eventType, setEventType] = useState("")
  const [description, setDescription] = useState("")
  const [questions, setQuestions] = useState<MockQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [buildProgress, setBuildProgress] = useState(0)

  const handleTriggerSelect = (id: string) => {
    setSelectedTrigger(id)
    if (id === "manual") setPhase("describe")
  }

  const startBuild = (afterMs: number, onDone: () => void) => {
    let progress = 0
    setBuildProgress(0)
    const timer = window.setInterval(() => {
      progress += 15
      setBuildProgress(Math.min(progress, 100))
      if (progress >= 100) {
        window.clearInterval(timer)
        onDone()
      }
    }, afterMs)
  }

  const handleDescribe = () => {
    if (!description.trim()) return
    setPhase("building")
    startBuild(300, () => {
      setQuestions([
        { id: "q1", question: "Which URL should I monitor?", type: "text" },
        { id: "q2", question: "How should I notify you when something is found?", type: "choice", options: ["In-app notification", "Log only", "Create a task"] },
      ])
      setPhase("questions")
    })
  }

  const handleAnswer = (answer: string) => {
    const updated = [...questions]
    const target = updated[currentQ]
    if (target) updated[currentQ] = { ...target, answer }
    setQuestions(updated)

    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1)
      return
    }

    setPhase("building")
    startBuild(250, () => {
      const steps = buildGeneratedSteps(selectedTrigger!, { interval, eventType }, updated)
      setPhase("done")
      onComplete({
        trigger: selectedTrigger!,
        triggerConfig: { interval, eventType },
        description,
        steps,
      })
    })
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="px-5 py-6 space-y-6 max-w-md mx-auto">
          <TriggerStep
            phase={phase}
            selectedTrigger={selectedTrigger}
            interval={interval}
            eventType={eventType}
            onSelect={handleTriggerSelect}
            onIntervalChange={setInterval}
            onEventChange={setEventType}
            onConfirm={() => setPhase("describe")}
          />

          {(phase === "describe" || phase === "building" || phase === "questions" || phase === "done") && (
            <DescribeStep
              phase={phase}
              description={description}
              onDescriptionChange={setDescription}
              onSubmit={handleDescribe}
            />
          )}

          {phase === "building" && <BuildingProgress progress={buildProgress} />}

          {phase === "questions" && questions[currentQ] && (
            <QuestionStep
              question={questions[currentQ]}
              index={currentQ}
              total={questions.length}
              onAnswer={handleAnswer}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
