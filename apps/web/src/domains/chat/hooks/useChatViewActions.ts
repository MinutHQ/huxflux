import { useCallback } from "react"
import type React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, queryKeys } from "@huxflux/shared"
import type { Agent, AgentSummary, PRComment } from "@huxflux/shared"
import type { PendingQuestion } from "../chat.types"

interface Attachment { name: string; path: string; mimeType: string }

interface UseChatViewActionsArgs {
  agent: Agent
  input: string
  setInput: (updater: (prev: string) => string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  pendingComments: PRComment[]
  attachments: Attachment[]
  setAttachments: (updater: (prev: Attachment[]) => Attachment[]) => void
  setLinkedAgents: (updater: (prev: AgentSummary[]) => AgentSummary[]) => void
  planMode: boolean
  setPlanMode: (v: boolean) => void
  setAwaitingPlanApproval: (v: boolean) => void
  effort: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mentionsSlash: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chatSend: any
  onClearComments?: () => void
  pendingQuestion?: PendingQuestion | null
  onClearPendingQuestion?: () => void
  uploadFiles: (files: File[]) => void
}

export function useChatViewActions(args: UseChatViewActionsArgs) {
  const queryClient = useQueryClient()
  const { agent, input, setInput, textareaRef, pendingComments, attachments, setAttachments,
    setLinkedAgents, planMode, setPlanMode, setAwaitingPlanApproval, effort, mentionsSlash,
    chatSend, onClearComments, pendingQuestion, onClearPendingQuestion, uploadFiles } = args

  function handleInputChange(value: string) {
    setInput(() => value)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
    mentionsSlash.detectInputTriggers(value)
  }

  function handleSend() {
    const text = input.trim()
    if ((!text && pendingComments.length === 0 && attachments.length === 0) || chatSend.isSending) return
    const isPlan = planMode
    setInput(() => "")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    void api.agents.update(agent.id, { draft: "" })
    onClearComments?.()
    setAttachments(() => [])
    mentionsSlash.setMentionAttachments(() => [])
    if (isPlan) setAwaitingPlanApproval(true)
    void chatSend.buildAndQueue(text, isPlan, effort)
  }

  function handlePlanApprove() {
    setAwaitingPlanApproval(false)
    setPlanMode(false)
    void chatSend.sendContent("Plan approved", "Plan approved — execute it now.")
  }

  async function handleAnswerQuestion(answers: Record<string, string>) {
    // Pass `toolUseId` so the server can write the answer file the file-based
    // AskUserQuestion hook is polling for. Legacy hooks without a toolUseId
    // continue to work via the older /answer endpoint behaviour.
    // fire-and-forget; intentional: non-fatal answer ping with explicit error swallowing
    // eslint-disable-next-line no-restricted-syntax
    try { await api.agents.answerQuestion(agent.id, answers, pendingQuestion?.toolUseId) } catch { /* non-fatal */ }
    onClearPendingQuestion?.()
  }

  async function handleModelChange(value: string) {
    const [providerId, ...modelParts] = value.split(":")
    const modelId = modelParts.join(":")
    const updates: Record<string, string> = { model: modelId }
    if (providerId !== (agent.provider ?? "claude")) updates.provider = providerId
    // fire-and-forget; intentional: model-switch updates cache before/after for instant feedback
    // eslint-disable-next-line no-restricted-syntax
    await api.agents.update(agent.id, updates as Parameters<typeof api.agents.update>[1])
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => old ? { ...old, ...updates } : old)
  }

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    uploadFiles(files)
  }, [uploadFiles])

  function toggleLinkedAgent(a: AgentSummary) {
    setLinkedAgents((prev) => prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a])
  }

  function broadcastSend(msg: string) { void chatSend.sendContent(msg, msg) }

  return {
    handleInputChange,
    handleSend,
    handlePlanApprove,
    handleAnswerQuestion,
    handleModelChange,
    handleFileSelect,
    toggleLinkedAgent,
    broadcastSend,
  }
}
