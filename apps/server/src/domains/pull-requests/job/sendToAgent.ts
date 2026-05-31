import { config } from "../../../config.js"

// Post a message to an agent by hitting our own HTTP API. The poller can't
// call the message service directly because that would bypass route-level
// validation and auth. Used to surface PR review comments, CI failures, and
// merge-conflict notifications.
export async function sendToAgent(agentId: string, content: string, sender: string): Promise<void> {
  const body = JSON.stringify({ content, sender })
  await fetch(`http://localhost:${config.boundPort}/api/agents/${agentId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body,
  })
}
