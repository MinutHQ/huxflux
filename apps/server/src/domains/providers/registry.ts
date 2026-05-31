// Provider registry: built-in adapters plus the test-only registration seam.
// Other domains import `getProvider`, `registerProvider`, etc. from this file
// directly. Subfolders under `service/` hold the per-provider adapter
// implementations and are not cross-domain reachable.

import type { ProviderId, ProviderAdapter } from "./providers.types.js"
import { claudeProvider } from "./service/claude.js"
import { codexProvider } from "./service/codex.js"
import { geminiProvider } from "./service/gemini.js"
import { claudeInteractiveProvider } from "./service/claudeInteractive.js"

const builtinProviders: Record<string, ProviderAdapter> = {
  claude: claudeProvider,
  "claude-interactive": claudeInteractiveProvider,
  codex: codexProvider,
  gemini: geminiProvider,
}

let providers: Record<string, ProviderAdapter> = { ...builtinProviders }

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

/**
 * Register an extra provider adapter under the given id. Test-only seam: lets
 * the runner E2E install a fake provider that points at the fake-claude binary
 * without modifying any built-in. Throws if `id` is already taken so a typo
 * can't shadow `"claude"` by accident.
 */
export function registerProvider(id: string, adapter: ProviderAdapter): void {
  if (providers[id]) {
    throw new Error(`provider "${id}" already registered`)
  }
  providers[id] = adapter
}

/** Restore the built-in provider map. Test-only. */
export function _resetProviders(): void {
  providers = { ...builtinProviders }
}

export { type ProviderId, type ProviderAdapter } from "./providers.types.js"
