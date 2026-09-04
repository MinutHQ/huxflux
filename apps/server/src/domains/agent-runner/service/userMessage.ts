// User-message presentation helpers shared by the turn bootstrap and the
// mid-run injection path.

import { v4 as uuid } from "uuid"
import { db } from "../../../db/index.js"
import { messages as messagesTable } from "../../../db/schema.js"
import { agentsWs } from "../../agents/agents.ws.js"

/**
 * Strip internal metadata (linked workspaces, attached files, linked agents)
 * from a user message so the chat displays cleanly. The full content is still
 * what the model receives.
 */
export function stripDisplayContent(userContent: string): string {
  return userContent
    .replace(/\n\n---\n\nLinked workspaces[\s\S]*$/, "")
    .replace(/^Attached files:\n[\s\S]*?\n\n---\n\n/, "")
    .replace(/\n\n---\n\nLinked agents[\s\S]*$/, "")
    .trim()
}

/**
 * Persist a mid-run injected user message row and emit the `message:user` WS
 * event. `injected: true` on the payload lets the UI mark the message as
 * delivered into a running turn (WS-only — reloads render it as a plain user
 * message). Ordering comes from the turn split that follows the injection: the
 * previous assistant segment keeps its earlier createdAt and the new segment's
 * skeleton is created after this row.
 */
export function persistUserMessageRow(agentId: string, userContent: string, sender?: string): void {
  const displayContent = stripDisplayContent(userContent) || userContent
  const id = uuid()
  const now = new Date().toISOString()
  db.insert(messagesTable).values({
    id,
    agentId,
    role: "user",
    content: displayContent,
    timestamp: now,
    createdAt: now,
    ...(sender ? { sender } : {}),
  }).run()
  agentsWs.messageUser(agentId, { id, role: "user" as const, content: displayContent, timestamp: now, injected: true, ...(sender ? { sender } : {}) })
}
