import { db } from "../../db/index.js"
import { messages as messagesTable } from "../../db/schema.js"
import { eq } from "drizzle-orm"

/**
 * Build a conversation context string for providers that don't support session resume.
 * Fetches the last N messages for the agent and formats them with role markers.
 */
export function buildConversationContext(agentId: string, maxMessages = 10): string {
  const msgs = db.select()
    .from(messagesTable)
    .where(eq(messagesTable.agentId, agentId))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Take the last N messages
  const recent = msgs.slice(-maxMessages)
  if (recent.length === 0) return ""

  const lines = recent.map((m) => {
    const role = m.role === "user" ? "User" : "Assistant"
    // Truncate very long messages to keep context manageable
    const content = m.content.length > 2000
      ? m.content.slice(0, 2000) + "\n[...truncated]"
      : m.content
    return `${role}: ${content}`
  })

  return `Previous conversation:\n\n${lines.join("\n\n")}\n\n---\n\n`
}
