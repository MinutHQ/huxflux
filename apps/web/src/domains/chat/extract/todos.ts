import type { Message } from "@huxflux/shared"
import type { TodoItem } from "../chat.types"

export function extractLatestTodos(messages: Message[]): TodoItem[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg.toolCalls) continue
    for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
      const tc = msg.toolCalls[j]
      if (tc.tool !== "TodoWrite") continue
      try {
        const parsed = JSON.parse(tc.args ?? "{}")
        const todos = parsed.todos ?? parsed
        if (Array.isArray(todos) && todos.length > 0) return todos as TodoItem[]
      } catch { /* ignore */ }
    }
  }
  return []
}
