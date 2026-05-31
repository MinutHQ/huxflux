// WebSocket events emitted by the tasks domain.
//
// See `apps/server/src/domains/ws/define.ts` for the helper that turns this
// config map into the typed `tasksWs` callable object. The composed
// `ServerEvent` union in `src/domains/ws/events.ts` reads `TasksServerEvent`
// from here.

import { defineEvents, type InferEvents } from "../ws/define.js"

type TaskComment = { id: string; author: string; role: string; content: string; agentId?: string; createdAt: string }

const tasksEventsConfig = {
  taskComment: {
    channel: "broadcast",
    build: (taskId: string, comment: TaskComment) => ({ type: "task:comment" as const, taskId, comment }),
  },
  taskUpdated: {
    channel: "broadcast",
    build: (taskId: string) => ({ type: "task:updated" as const, taskId }),
  },
} as const

export const tasksWs = defineEvents(tasksEventsConfig)

export type TasksServerEvent = InferEvents<typeof tasksEventsConfig>
