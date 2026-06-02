import { useEffect, useMemo, useRef } from "react"
import { api, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import type { Agent } from "@huxflux/shared"
import { FALLBACK_MODELS } from "../config"

type ActiveTab = "chat" | "file" | "diff-browser" | "pr"

export function useProvidersAndModels(agent: Agent) {
  const { data: providers = [] } = useHuxfluxQuery({
    queryKey: queryKeys.settings.providers(),
    queryFn: api.settings.providers,
    staleTime: 60_000,
  })
  const allModels = useMemo(() => {
    if (providers.length === 0) return FALLBACK_MODELS
    return providers
      .filter((p) => p.available)
      .flatMap((p) => p.models.map((m) => ({ id: m.api || m.id, label: m.label, provider: p.id })))
  }, [providers])
  const currentProvider = providers.find((p) => p.id === (agent.provider ?? "claude"))
  const capabilities = currentProvider?.capabilities ?? {}
  return { providers, allModels, capabilities }
}

export function useDraftAutosave(agentId: string, input: string) {
  const agentIdRef = useRef(agentId)
  useEffect(() => {
    agentIdRef.current = agentId
  }, [agentId])
  useEffect(() => {
    const id = agentIdRef.current
    const timer = setTimeout(() => {
      void api.agents.update(id, { draft: input })
    }, 500)
    return () => clearTimeout(timer)
  }, [input])
}

export function useFlushDraftOnSwitch(agent: Agent, prevAgentIdRef: React.MutableRefObject<string | null>, inputRef: React.MutableRefObject<string>) {
  useEffect(() => {
    const prevId = prevAgentIdRef.current
    if (prevId && prevId !== agent.id) {
      void api.agents.update(prevId, { draft: inputRef.current })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id])
}

export function useInitialMessage(initialMessage: string | null | undefined, onConsume: (() => void) | undefined, sendContent: (display: string, api: string) => Promise<void>) {
  const initialMessageSent = useRef(false)
  useEffect(() => {
    if (initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true
      onConsume?.()
      void sendContent(initialMessage, initialMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage])
}

/**
 * Pre-fill the chat input with text the user was typing on the setup screen
 * but never explicitly submitted (no Enter / no send-button click). Runs once
 * on mount; the consume callback clears the source so a tab switch doesn't
 * re-apply the same draft. Distinct from `useInitialMessage`, which auto-sends.
 */
export function useInitialDraft(initialDraft: string | null | undefined, onConsume: (() => void) | undefined, setInput: (v: string) => void) {
  const applied = useRef(false)
  useEffect(() => {
    if (initialDraft && !applied.current) {
      applied.current = true
      setInput(initialDraft)
      onConsume?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft])
}

export function useResetOnAgentSwitch(agentId: string, setActiveTab: (t: ActiveTab) => void, setIsAtBottom: (v: boolean) => void, bottomRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    setActiveTab("chat")
    setIsAtBottom(true)
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])
}
