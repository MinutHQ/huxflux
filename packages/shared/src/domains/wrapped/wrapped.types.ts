// Cross-platform Zod schema for the AI-generated "Wrapped" recap surface.

import { z } from "zod/v4"

export const wrappedSummarySchema = z.object({
  summary: z.string(),
  periodKey: z.string(),
  cached: z.boolean(),
})

export type WrappedSummary = z.infer<typeof wrappedSummarySchema>
