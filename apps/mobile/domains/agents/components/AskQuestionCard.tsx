import { useState } from "react"
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { api, HuxfluxApiError, useHuxfluxMutation, type AgentPendingQuestion } from "@huxflux/shared"
import { c } from "@/theme"
import { useAskQuestionForm } from "../hooks/useAskQuestionForm"
import { AskQuestionStep } from "./AskQuestionStep"

function describeAnswerError(err: unknown): string {
  if (err instanceof HuxfluxApiError && err.status === 409) {
    return "This question expired or was replaced. Check the latest message from the agent."
  }
  return err instanceof Error && err.message ? err.message : "Could not send the answer."
}

function NavButton({ label, onPress, disabled, primary, busy }: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
  busy?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, minWidth: 64, alignItems: "center",
        backgroundColor: primary ? (disabled ? c.secondary : c.fgBright) : "transparent",
        borderWidth: primary ? 0 : 1, borderColor: c.border,
        opacity: disabled && !primary ? 0.5 : 1,
      }}
    >
      {busy
        ? <ActivityIndicator size="small" color={c.fgSub} />
        : <Text style={{ color: primary && !disabled ? c.fgBrightFg : c.fgSub, fontSize: 13, fontWeight: "600" }}>{label}</Text>}
    </TouchableOpacity>
  )
}

/**
 * The AskUserQuestion the agent's turn is blocked on. Steps through the
 * questions one at a time and posts every answer at once. Mount it keyed by
 * `toolUseId` so a replacement question starts from a clean form.
 */
export function AskQuestionCard({ agentId, pendingQuestion, onAnswered }: {
  agentId: string
  pendingQuestion: AgentPendingQuestion
  onAnswered: () => void
}) {
  const { questions, toolUseId } = pendingQuestion
  const form = useAskQuestionForm(questions)
  const [step, setStep] = useState(0)

  const submit = useHuxfluxMutation<unknown, Record<string, string>>({
    mutationFn: (answers) => api.agents.answerQuestion(agentId, answers, toolUseId),
    onSuccess: () => onAnswered(),
  })

  const current = questions[step]
  if (!current) return null
  const isLast = step === questions.length - 1
  const sending = submit.isPending

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, maxHeight: 420 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
        <Ionicons name="help-circle-outline" size={16} color={c.warning} />
        <Text style={{ color: c.fg, fontSize: 13, fontWeight: "600", flex: 1 }}>Agent is asking a question</Text>
        {questions.length > 1 && (
          <Text style={{ color: c.fgSub, fontSize: 12 }}>{step + 1} of {questions.length}</Text>
        )}
      </View>

      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <AskQuestionStep
          question={current}
          draft={form.drafts[step] ?? { selected: [], other: "" }}
          onToggle={(label) => form.toggleOption(step, label)}
          onOtherChange={(text) => form.setOther(step, text)}
          disabled={sending}
        />
      </ScrollView>

      {submit.isError && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingBottom: 6 }}>
          <Text style={{ color: c.error, fontSize: 12, flex: 1 }}>{describeAnswerError(submit.error)}</Text>
          {/* The question may already be gone (answered elsewhere, agent stopped); let the user drop the card. */}
          <TouchableOpacity onPress={onAnswered} hitSlop={8}>
            <Text style={{ color: c.error, fontSize: 12, fontWeight: "600", textDecorationLine: "underline" }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 }}>
        {questions.length > 1 && (
          <NavButton label="Back" onPress={() => setStep((s) => s - 1)} disabled={step === 0 || sending} />
        )}
        <View style={{ flex: 1 }} />
        {isLast
          ? <NavButton label="Submit" primary busy={sending} disabled={!form.allAnswered || sending} onPress={() => submit.mutate(form.buildAnswerRecord())} />
          : <NavButton label="Next" primary disabled={!form.isAnswered(step)} onPress={() => setStep((s) => s + 1)} />}
      </View>
    </View>
  )
}
