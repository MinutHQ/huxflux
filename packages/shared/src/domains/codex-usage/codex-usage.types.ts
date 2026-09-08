import { claudeUsageSchema } from "../claude-usage/claude-usage.types.js"
import type { z } from "zod/v4"

// Both providers expose the same normalized quota windows. Codex does not
// report monetary spend through account/rateLimits/read, so spend is null.
export const codexUsageSchema = claudeUsageSchema
export type CodexUsage = z.infer<typeof codexUsageSchema>
