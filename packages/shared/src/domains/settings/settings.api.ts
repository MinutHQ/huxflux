import { z } from "zod/v4"
import { reqValidated } from "../../apiBase.js"
import {
  huxfluxSettingsSchema,
  partialHuxfluxSettingsSchema,
  providerInfoSchema,
  serverConfigSchema,
  serverVersionInfoSchema,
  updateResultSchema,
  feedbackRequestSchema,
  feedbackResponseSchema,
  type HuxfluxSettings,
  type FeedbackRequest,
} from "./settings.types.js"

export const settingsApi = {
  // Settings blob (review prompt, default model, poller toggles, etc.)
  // `current` (not `get`) because there's only one settings record per server,
  // not a collection.
  current: () => reqValidated(huxfluxSettingsSchema, "/api/settings"),
  update: (body: Partial<HuxfluxSettings>) =>
    reqValidated(huxfluxSettingsSchema, "/api/settings", {
      method: "PATCH",
      body: JSON.stringify(partialHuxfluxSettingsSchema.parse(body)),
    }),

  // Server config / feature flags
  serverConfig: () => reqValidated(serverConfigSchema, "/api/config"),
  providers: () => reqValidated(z.array(providerInfoSchema), "/api/providers"),

  // System / updates
  serverVersion: () => reqValidated(serverVersionInfoSchema, "/api/system/version"),
  checkUpdate: () =>
    reqValidated(serverVersionInfoSchema, "/api/system/version/check", { method: "POST" }),
  triggerUpdate: () =>
    reqValidated(updateResultSchema, "/api/system/update", { method: "POST" }),

  // Feedback (consumed by the in-app feedback dialog)
  submitFeedback: (body: FeedbackRequest) =>
    reqValidated(feedbackResponseSchema, "/api/feedback", {
      method: "POST",
      body: JSON.stringify(feedbackRequestSchema.parse(body)),
    }),
}
