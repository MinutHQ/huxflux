import { useRef, useState, useEffect } from "react"
import type { AgentSummary } from "@huxflux/shared"

interface Attachment {
  name: string
  path: string
  mimeType: string
}

/**
 * Cache per-agent UI state across agent switches so that linkedAgents,
 * attachments, planMode, and plan approval persist when switching tabs.
 */
export function useAgentStateCache(agentId: string, draft: string | null | undefined) {
  const [linkedAgents, setLinkedAgents] = useState<AgentSummary[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [planMode, setPlanMode] = useState(false)
  const [awaitingPlanApproval, setAwaitingPlanApproval] = useState(false)
  const [input, setInput] = useState(draft ?? "")

  const linkedAgentsCache = useRef(new Map<string, AgentSummary[]>())
  const attachmentsCache = useRef(new Map<string, Attachment[]>())
  const planModeCache = useRef(new Map<string, boolean>())
  const planApprovalCache = useRef(new Map<string, boolean>())
  const prevAgentIdRef = useRef<string | null>(null)
  const inputRef = useRef(input)
  inputRef.current = input

  useEffect(() => {
    const prevId = prevAgentIdRef.current
    if (prevId && prevId !== agentId) {
      // Save state for the outgoing agent
      linkedAgentsCache.current.set(prevId, linkedAgents)
      planModeCache.current.set(prevId, planMode)
      planApprovalCache.current.set(prevId, awaitingPlanApproval)
      attachmentsCache.current.set(prevId, attachments)
    }
    if (prevId !== agentId) {
      prevAgentIdRef.current = agentId
      setInput(draft ?? "")
      setLinkedAgents(linkedAgentsCache.current.get(agentId) ?? [])
      setPlanMode(planModeCache.current.get(agentId) ?? false)
      setAwaitingPlanApproval(planApprovalCache.current.get(agentId) ?? false)
      setAttachments(attachmentsCache.current.get(agentId) ?? [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  return {
    input, setInput, inputRef,
    linkedAgents, setLinkedAgents,
    attachments, setAttachments,
    planMode, setPlanMode,
    awaitingPlanApproval, setAwaitingPlanApproval,
    prevAgentIdRef,
  }
}
