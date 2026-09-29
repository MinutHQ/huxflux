import { useMemo, useCallback, useState } from "react"
import { Alert } from "react-native"
import { File as ExpoFile } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useAgent, api, checkAttachmentSize, describeUploadError } from "@huxflux/shared"
import type { Attachment } from "../agents.types"
import { extractTeamAgents } from "../utils"
import { useChatSession } from "./useChatSession"
import { useChatSend } from "./useChatSend"

type SetAttachments = React.Dispatch<React.SetStateAction<Attachment[]>>
type SetUploading = React.Dispatch<React.SetStateAction<number>>

async function uploadAsset(sessionId: string, asset: ImagePicker.ImagePickerAsset, setAttachments: SetAttachments) {
  const mimeType = asset.mimeType ?? "image/jpeg"
  const name = asset.fileName ?? `image-${Date.now()}.jpg`
  try {
    const file = new ExpoFile(asset.uri)
    const tooBig = checkAttachmentSize(name, asset.fileSize ?? file.size)
    if (tooBig) {
      Alert.alert("Image too large", tooBig)
      return
    }
    const base64 = await file.base64()
    // fire-and-forget; intentional: native image picker upload chained off a callback, not render-time
    // eslint-disable-next-line no-restricted-syntax
    const uploaded = await api.agents.uploadFile(sessionId, name, `data:${mimeType};base64,${base64}`, mimeType)
    setAttachments((prev) => [...prev, { ...uploaded, localUri: asset.uri }])
  } catch (err) {
    Alert.alert("Upload failed", describeUploadError(name, err))
  }
}

async function pickAndUploadImages(sessionId: string | null, setAttachments: SetAttachments, setUploading: SetUploading) {
  if (!sessionId) {
    Alert.alert("No chat yet", "Wait for the chat to finish loading, then attach the image again.")
    return
  }
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
  // One at a time: each upload holds the whole photo as a base64 string, and
  // several large photos at once can exhaust memory on low-end phones.
  setUploading((n) => n + result.assets.length)
  for (const asset of result.assets) {
    await uploadAsset(sessionId, asset, setAttachments)
    setUploading((n) => n - 1)
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

  const [uploadingCount, setUploadingCount] = useState(0)
  const pickImage = useCallback(() => {
    pickAndUploadImages(session.activeSessionId, send.setAttachments, setUploadingCount)
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
    uploadingCount,
  }
}
