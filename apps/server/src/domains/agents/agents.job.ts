import type { Job } from "../../jobTypes.js"
import { cleanDeadPorts } from "../git/processes.js"

export const agentsJob: Job = {
  name: "agents-port-cleanup",
  start() {
    setInterval(() => { cleanDeadPorts().catch(() => {}) }, 30_000)
  },
}
