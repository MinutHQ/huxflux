import { z } from "zod/v4"
import { reqValidated } from "../../apiBase.js"
import {
  automationSchema,
  automationRunSchema,
  createAutomationBodySchema,
  updateAutomationBodySchema,
  replyToAutomationBuilderBodySchema,
  type CreateAutomationBody,
  type UpdateAutomationBody,
} from "./automations.types.js"

const replyResponseSchema = z.object({ agentId: z.string() })

export const automationsApi = {
  // Automations
  list: () => reqValidated(z.array(automationSchema), "/api/automations"),
  get: (id: string) => reqValidated(automationSchema, `/api/automations/${id}`),
  create: (body: CreateAutomationBody) =>
    reqValidated(automationSchema, "/api/automations", {
      method: "POST",
      body: JSON.stringify(createAutomationBodySchema.parse(body)),
    }),
  update: (id: string, body: UpdateAutomationBody) =>
    reqValidated(automationSchema, `/api/automations/${id}`, {
      method: "PUT",
      body: JSON.stringify(updateAutomationBodySchema.parse(body)),
    }),
  delete: (id: string) =>
    reqValidated(z.void(), `/api/automations/${id}`, { method: "DELETE" }),
  run: (id: string) =>
    reqValidated(automationRunSchema, `/api/automations/${id}/run`, { method: "POST" }),
  runs: (id: string) =>
    reqValidated(z.array(automationRunSchema), `/api/automations/${id}/runs`),
  replyToBuilder: (id: string, content: string) =>
    reqValidated(replyResponseSchema, `/api/automations/${id}/reply`, {
      method: "POST",
      body: JSON.stringify(replyToAutomationBuilderBodySchema.parse({ content })),
    }),
}
