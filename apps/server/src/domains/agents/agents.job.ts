import type { Job } from "../../jobTypes.js"
import { getAllPortsFromDB } from "../git/processes.js"

// Periodic dead-port cleanup. `getAllPortsFromDB` checks every recorded
// agent port with `lsof` and removes records whose process is gone, as a
// side effect. Cheap (~one lsof per port) and runs every 30 seconds.

function cleanPorts(): void {
  try {
    getAllPortsFromDB()
  } catch {
    /* lsof unavailable or DB error — best-effort cleanup */
  }
}

export const agentsJob: Job = {
  name: "agents-port-cleanup",
  start() {
    setInterval(cleanPorts, 30_000)
  },
}
