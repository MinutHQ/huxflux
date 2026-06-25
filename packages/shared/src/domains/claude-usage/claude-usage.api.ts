import { reqValidated } from "../../apiBase.js"
import { claudeUsageSchema } from "./claude-usage.types.js"

export const claudeUsageApi = {
  // Singular endpoint — the response is the current usage snapshot for the
  // machine the server runs on, not a collection. The upstream Anthropic call
  // is capped at 5s server-side; give the round-trip a little headroom here.
  current: () => reqValidated(claudeUsageSchema, "/api/claude/usage", { timeoutMs: 8_000 }),
}
