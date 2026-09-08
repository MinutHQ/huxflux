import { reqValidated } from "../../apiBase.js"
import { codexUsageSchema } from "./codex-usage.types.js"

export const codexUsageApi = {
  current: () => reqValidated(codexUsageSchema, "/api/codex/usage", { timeoutMs: 12_000 }),
}
