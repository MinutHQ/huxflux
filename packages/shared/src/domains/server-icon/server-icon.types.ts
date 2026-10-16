// Cross-platform schemas for generating a server's switcher icon with the
// Codex CLI on that server's machine.

import { z } from "zod/v4"

export const serverIconCapabilitiesSchema = z.object({
  // True when the Codex CLI is installed on the server, so it can draw icons.
  codex: z.boolean(),
})

export const generateServerIconBodySchema = z.object({
  description: z.string().trim().min(1).max(300),
})

export const generateServerIconResponseSchema = z.object({
  // data: URL of the icon. A full-size PNG when Codex's image tool is
  // available (ChatGPT login), otherwise sanitized SVG markup. Clients
  // downscale before storing.
  dataUrl: z.string(),
})

export type ServerIconCapabilities = z.infer<typeof serverIconCapabilitiesSchema>
export type GenerateServerIconBody = z.infer<typeof generateServerIconBodySchema>
export type GenerateServerIconResponse = z.infer<typeof generateServerIconResponseSchema>
