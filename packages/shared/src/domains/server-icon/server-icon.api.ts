import { reqValidated } from "../../apiBase.js"
import {
  generateServerIconBodySchema, generateServerIconResponseSchema, serverIconCapabilitiesSchema,
  type GenerateServerIconBody,
} from "./server-icon.types.js"

export const serverIconApi = {
  capabilities: () => reqValidated(serverIconCapabilitiesSchema, "/api/server-icon/capabilities"),
  /** Asks Codex to draw an icon. Slow (a model turn plus image generation), hence the long timeout. */
  generate: (body: GenerateServerIconBody) =>
    reqValidated(generateServerIconResponseSchema, "/api/server-icon/generate", {
      method: "POST",
      body: JSON.stringify(generateServerIconBodySchema.parse(body)),
      timeoutMs: 150_000,
    }),
}
