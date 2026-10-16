import type { ServerAttention } from "@huxflux/shared"

/** One-line human summary, or null when the server needs nothing. */
export function describeAttention(attention: ServerAttention | null | undefined): string | null {
  if (!attention) return null
  const parts: string[] = []
  if (attention.waiting > 0) parts.push(`${attention.waiting} waiting on you`)
  if (attention.unread > 0) parts.push(`${attention.unread} unread`)
  return parts.length > 0 ? parts.join(" · ") : null
}

/** Initials for a server avatar: first letters of the first two words, else the first two characters. */
export function serverInitials(name: string): string {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean)
  const initials = words.length >= 2 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : name.trim().slice(0, 2)
  return initials.toUpperCase() || "?"
}
