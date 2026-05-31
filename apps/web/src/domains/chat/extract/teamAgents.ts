import type { Message, ToolCall } from "@huxflux/shared"
import type { TeamAgent } from "../chat.types"

function collectSendMessagesByAgent(toolCalls: ToolCall[]): Map<string, ToolCall[]> {
  // Collect SendMessage calls directed at specific agents to show per-agent activity
  const sendMessages = toolCalls.filter((tc) => tc.tool === "SendMessage")
  const sendMessagesByAgent = new Map<string, ToolCall[]>()
  for (const sm of sendMessages) {
    if (!sm.args) continue
    try {
      const parsed = JSON.parse(sm.args)
      const to = parsed.to as string | undefined
      if (to) {
        const existing = sendMessagesByAgent.get(to) ?? []
        existing.push(sm)
        sendMessagesByAgent.set(to, existing)
      }
    } catch (err) { console.warn("Failed to parse SendMessage args", sm.args, err) }
  }
  return sendMessagesByAgent
}

function buildAgent(
  tc: ToolCall,
  sendMessagesByAgent: Map<string, ToolCall[]>,
  isStreaming: boolean | undefined,
): TeamAgent {
  let description = "Agent"
  let prompt: string | undefined
  let name: string | undefined
  if (tc.args) {
    try {
      const parsed = JSON.parse(tc.args)
      description = parsed.description || parsed.prompt?.slice(0, 40) || "Agent"
      prompt = parsed.prompt
      name = parsed.name
    } catch {
      description = tc.args.length > 40 ? tc.args.slice(0, 40) + "…" : tc.args
    }
  }

  // Build sub-calls: actual subCalls + any SendMessage calls targeting this agent by name
  let combinedSubCalls = tc.subCalls ? [...tc.subCalls] : []
  if (name) {
    const directed = sendMessagesByAgent.get(name)
    if (directed) combinedSubCalls = [...combinedSubCalls, ...directed]
  }

  return {
    id: tc.id,
    description,
    prompt,
    name,
    status: (!isStreaming || tc.result != null) ? "done" as const : "running" as const,
    subCalls: combinedSubCalls.length > 0 ? combinedSubCalls : undefined,
    outputText: tc.outputText,
    result: tc.result,
  }
}

export function extractTeamAgents(messages: Message[], isStreaming?: boolean): TeamAgent[] {
  // Only show agents from the latest message that has Agent tool calls
  // so a new team supersedes the old one
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    const agentCalls = msg.toolCalls.filter((tc) => tc.tool === "Agent")
    if (agentCalls.length === 0) continue

    const sendMessagesByAgent = collectSendMessagesByAgent(msg.toolCalls)
    return agentCalls.map((tc) => buildAgent(tc, sendMessagesByAgent, isStreaming))
  }
  return []
}
