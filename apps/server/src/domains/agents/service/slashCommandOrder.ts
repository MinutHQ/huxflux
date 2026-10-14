// Ordering for the `/` command picker: the most recently used commands first
// (newest at the top), then everything else alphabetically.
//
// Recency is derived from the user's own past messages rather than a separate
// usage table. Agents are soft-deleted, so their message history survives and
// keeps counting.

import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "../../../db/index.js"
import { messages as messagesTable } from "../../../db/schema.js"
import type { SlashCommand } from "../agents.types.js"

export const RECENT_COMMAND_LIMIT = 5

// How many of the latest user messages to scan for slash commands.
const RECENT_MESSAGE_SCAN = 500

// A slash command at the start of any line. The composer may prepend context
// blocks (PR comments, attached files, terminal output) above the user's text,
// so the command is not always on the first line.
const COMMAND_PATTERN = /(?:^|\n)\/([A-Za-z0-9_:.-]+)(?=\s|$)/g

/** Command names found in a message, in the order they appear. */
export function extractCommandNames(content: string): string[] {
  return Array.from(content.matchAll(COMMAND_PATTERN), (m) => m[1] ?? "").filter(Boolean)
}

/** Distinct command names from the user's latest messages, newest first. */
export function loadRecentCommandNames(): string[] {
  const rows = db.select({ content: messagesTable.content }).from(messagesTable)
    .where(and(eq(messagesTable.role, "user"), isNull(messagesTable.sender)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(RECENT_MESSAGE_SCAN)
    .all()
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of rows) {
    for (const name of extractCommandNames(row.content)) {
      if (seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export function sortCommandsByName(commands: SlashCommand[]): SlashCommand[] {
  return [...commands].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Put up to `RECENT_COMMAND_LIMIT` recently used commands first, in recency
 * order, followed by the remaining commands alphabetically. Recent names that
 * are not in `commands` (e.g. a project skill from another repo) are skipped.
 */
export function orderCommandsByRecency(commands: SlashCommand[], recentNames: string[]): SlashCommand[] {
  const byName = new Map(commands.map((c) => [c.name, c]))
  const recent: SlashCommand[] = []
  for (const name of recentNames) {
    if (recent.length >= RECENT_COMMAND_LIMIT) break
    const cmd = byName.get(name)
    if (cmd && !recent.includes(cmd)) recent.push(cmd)
  }
  const rest = sortCommandsByName(commands.filter((c) => !recent.includes(c)))
  return [...recent, ...rest]
}
