import type { ProviderId, ProviderAdapter } from "./types.js"
import { claudeProvider } from "./claude.js"
import { codexProvider } from "./codex.js"
import { opencodeProvider } from "./opencode.js"

const providers: Record<ProviderId, ProviderAdapter> = {
  claude: claudeProvider,
  codex: codexProvider,
  opencode: opencodeProvider,
}

export function getProvider(id: string): ProviderAdapter {
  const provider = providers[id as ProviderId]
  if (!provider) return providers.claude // fallback to claude
  return provider
}

export function getAvailableProviders(): ProviderAdapter[] {
  return Object.values(providers)
}

export function getInstalledProviders(): ProviderAdapter[] {
  return Object.values(providers).filter((p) => p.isAvailable())
}

export { type ProviderId, type ProviderAdapter } from "./types.js"
