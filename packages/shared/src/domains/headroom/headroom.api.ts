import { reqValidated } from "../../apiBase.js"
import { headroomAgentStatsSchema, headroomInstallStateSchema, headroomStatusSchema } from "./headroom.types.js"

export const headroomApi = {
  status: () => reqValidated(headroomStatusSchema, "/api/headroom/status"),
  agentStats: (agentId: string) =>
    reqValidated(headroomAgentStatsSchema, `/api/headroom/agents/${agentId}/stats`),
  /** Kick off an unattended CLI install (uv or pipx). Poll `status()` for progress. */
  install: () => reqValidated(headroomInstallStateSchema, "/api/headroom/install", { method: "POST" }),
}
