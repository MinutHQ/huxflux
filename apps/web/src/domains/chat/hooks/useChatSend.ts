import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api, isAgentStreaming, queryKeys } from "@huxflux/shared"
import type { Agent, Message, PRComment, AgentSummary } from "@huxflux/shared"
import type { MentionAttachment } from "./useMentionsAndSlash"

interface Attachment {
  name: string
  path: string
  mimeType: string
}

interface UseChatSendArgs {
  agent: Agent
  isStreaming: boolean
  pendingComments: PRComment[]
  attachments: Attachment[]
  linkedAgents: AgentSummary[]
  mentionAttachments: MentionAttachment[]
}

interface QueuedMessage {
  id: string
  agentId: string
  display: string
  api: string
  planMode?: boolean
}

async function buildContent(args: UseChatSendArgs, text: string): Promise<string> {
  let content = text
  const { agent, pendingComments, attachments, linkedAgents, mentionAttachments } = args

  if (pendingComments.length > 0) {
    const commentContext = pendingComments.map((c) => {
      const loc = c.path ? `${c.path.split("/").pop()}${c.line ? `:${c.line}` : ""}` : null
      return `@${c.author}${loc ? ` on \`${loc}\`` : ""}:\n> ${c.body.trim().replace(/\n/g, "\n> ")}`
    }).join("\n\n")
    content = `PR review comments:\n\n${commentContext}\n\n---\n\n${content}`
  }

  if (attachments.length > 0) {
    const fileBlock = attachments.map((f) => `- ${f.name}: ${f.path}`).join("\n")
    content = `Attached files:\n${fileBlock}\n\n---\n\n${content}`
  }

  // Replace @name mentions inline with their full paths
  const fileMentions = mentionAttachments.filter((m): m is { type: "file"; path: string; name: string } => m.type === "file")
  for (const mention of fileMentions) {
    content = content.replaceAll(`@${mention.name}`, mention.path)
  }

  // Terminal attachment (from chip)
  if (mentionAttachments.some((ma) => ma.type === "terminal")) {
    const lines = await api.agents.terminal(agent.id).catch(() => [] as string[])
    const termBlock = `<terminal>\n${lines.slice(-100).join("\n")}\n</terminal>`
    content = termBlock + "\n\n---\n\n" + content
  }

  if (linkedAgents.length > 0) {
    const agentBlock = linkedAgents.map((a) =>
      `- "${a.title}" (${a.branch}) — ID: ${a.id}`
    ).join("\n")
    content = `${content}\n\n---\n\nLinked workspaces (separate agents in other repos):\n${agentBlock}\n\nTo delegate a task to a linked workspace, emit this tag in your response (do NOT use SendMessage — it is for sub-agents, not linked workspaces):\n  <huxflux:delegate agent="<AGENT_ID>">task description</huxflux:delegate>`
  }

  return content
}

export function useChatSend(args: UseChatSendArgs) {
  const { agent, isStreaming } = args
  const queryClient = useQueryClient()
  const [isSending, setIsSending] = useState(false)
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([])

  const sendContent = useCallback(async (
    displayText: string,
    apiContent: string,
    opts?: { planMode?: boolean; effort?: string },
  ) => {
    setIsSending(true)
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: displayText,
      timestamp: new Date().toISOString(),
    }
    queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => {
      if (!old) return old
      return { ...old, messages: [...old.messages, optimisticMsg] }
    })
    try {
      // fire-and-forget; intentional: optimistic-rollback send with custom cache mutations and isSending bridged via WS streaming state
      // eslint-disable-next-line no-restricted-syntax
      await api.agents.sendMessage(agent.id, apiContent, opts)
      // Don't clear isSending immediately — wait for the server's streaming flag
      // to arrive via websocket so there's no gap in the loading indicator.
      // The flag clears itself when isAgentStreaming becomes true (see effect below).
    } catch {
      queryClient.setQueryData<Agent>(queryKeys.agents.detail(agent.id), (old) => {
        if (!old) return old
        return { ...old, messages: old.messages.filter((m) => m.id !== optimisticMsg.id) }
      })
      setIsSending(false)
    }
  }, [agent.id, queryClient])

  // Drain first queued message for the current agent when it stops streaming
  useEffect(() => {
    if (isStreaming) return
    const idx = messageQueue.findIndex((m) => m.agentId === agent.id)
    if (idx === -1) return
    const next = messageQueue[idx]
    setMessageQueue((prev) => prev.filter((_, i) => i !== idx))
    void sendContent(next.display, next.api, next.planMode ? { planMode: true } : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, agent.id])

  // Clear isSending once the server confirms streaming (bridges the gap)
  const serverStreaming = isAgentStreaming(agent)
  useEffect(() => {
    if (serverStreaming && isSending) setIsSending(false)
  }, [serverStreaming, isSending])

  const buildAndQueue = useCallback(async (text: string, isPlan: boolean, effort: string) => {
    const apiContent = await buildContent(args, text)
    if (isStreaming) {
      setMessageQueue((prev) => [...prev, {
        id: `q-${Date.now()}`,
        agentId: agent.id,
        display: text,
        api: apiContent,
        planMode: isPlan || undefined,
      }])
      return
    }
    const sendOpts: { planMode?: boolean; effort?: string } = {}
    if (isPlan) sendOpts.planMode = true
    if (effort) sendOpts.effort = effort
    void sendContent(text, apiContent, Object.keys(sendOpts).length > 0 ? sendOpts : undefined)
  }, [args, agent.id, isStreaming, sendContent])

  return {
    isSending,
    serverStreaming,
    messageQueue,
    setMessageQueue,
    sendContent,
    buildAndQueue,
  }
}
