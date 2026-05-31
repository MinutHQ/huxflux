import { useMemo, useCallback } from "react"
import { Alert } from "react-native"
import { File as ExpoFile } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useAgent, api } from "@huxflux/shared"
import type { Attachment } from "../agents.types"
import { extractTeamAgents } from "../utils"
import { useChatSession } from "./useChatSession"
import { useChatSend } from "./useChatSend"

async function pickAndUploadImages(activeSessionId: string, setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>) {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== "granted") {
    Alert.alert("Permission needed", "Allow photo access to attach images.")
    return
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsMultipleSelection: true,
  })
  if (result.canceled || !result.assets.length) return
  for (const asset of result.assets) {
    try {
      const file = new ExpoFile(asset.uri)
      const base64 = await file.base64()
      const mimeType = asset.mimeType ?? "image/jpeg"
      const name = asset.fileName ?? `image-${Date.now()}.jpg`
      const dataUrl = `data:${mimeType};base64,${base64}`
      // fire-and-forget; intentional: native image picker upload chained off a callback, not render-time
      // eslint-disable-next-line no-restricted-syntax
      const uploaded = await api.agents.uploadFile(activeSessionId, name, dataUrl, mimeType)
      setAttachments((prev) => [...prev, { ...uploaded, localUri: asset.uri }])
    } catch {
      Alert.alert("Upload failed", "Could not upload the selected image.")
    }
  }
}

/**
 * Composes the three pieces of agent-chat state — session, send pipeline,
 * and the underlying `useAgent` query — into the single object the screen needs.
 */
export function useAgentChat(rootId: string) {
  const session = useChatSession(rootId)
  const agentState = useAgent(session.activeSessionId)
  const { data: agent, isStreaming } = agentState
  const send = useChatSend(rootId, session.activeSessionId, !!isStreaming)

  const messages = useMemo(() => {
    const seen = new Set<string>()
    return (agent?.messages ?? []).filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
  }, [agent?.messages])

  const teamAgents = useMemo(() => extractTeamAgents(messages, isStreaming), [messages, isStreaming])

  const createSession = useCallback(() => {
    if (agent) session.createSession(agent)
  }, [agent, session])

  const pickImage = useCallback(() => {
    if (!session.activeSessionId) return
    pickAndUploadImages(session.activeSessionId, send.setAttachments)
  }, [session.activeSessionId, send.setAttachments])

  return {
    activeSessionId: session.activeSessionId,
    setActiveSessionId: session.setActiveSessionId,
    sessions: session.sessions,
    creatingSession: session.creatingSession,
    createSession,
    agent, agentState,
    messages, teamAgents, isStreaming,
    ...send,
    pickImage,
  }
}
