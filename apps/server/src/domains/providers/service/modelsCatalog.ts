import type { ProviderModel } from "../providers.types.js"
import { logger } from "../../../logger.js"

const CATALOG_URL = "https://models.dev/api.json"
const REFRESH_MS = 6 * 60 * 60 * 1000

const HARNESS_TO_PROVIDER: Record<string, string> = {
  claude: "anthropic",
  codex: "openai",
  gemini: "google",
}

/**
 * Direct model providers that Pi can route to via AI SDK adapters. Gateways and
 * resellers (openrouter, vercel, nano-gpt, etc.) are excluded because they
 * duplicate models already listed under the direct provider.
 */
const PI_CATALOG_PROVIDERS = [
  "anthropic", "openai", "google", "mistral", "deepseek", "cerebras",
  "groq", "cohere", "xai", "fireworks-ai", "togetherai", "perplexity",
  "meta", "amazon-bedrock", "azure", "nebius",
]

interface CatalogModel {
  id: string
  name: string
  family?: string
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number }
  reasoning?: boolean
  tool_call?: boolean
  structured_output?: boolean
  attachment?: boolean
}

interface CatalogProvider {
  id: string
  name: string
  models: Record<string, CatalogModel>
}

type Catalog = Record<string, CatalogProvider>

let catalog: Catalog | null = null
let fetchPromise: Promise<void> | null = null
let lastFetchAt = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function toCatalogModel(m: CatalogModel): ProviderModel {
  return {
    id: m.id,
    label: m.name,
    api: m.id,
    contextWindow: m.limit?.context,
    maxOutput: m.limit?.output,
    inputCost: m.cost?.input,
    outputCost: m.cost?.output,
    capabilities: {
      reasoning: m.reasoning,
      toolCall: m.tool_call,
      structuredOutput: m.structured_output,
      attachment: m.attachment,
    },
  }
}

function isUsableModel(m: CatalogModel): boolean {
  if (!m.id || !m.name) return false
  const family = (m.family ?? "").toLowerCase()
  const id = m.id.toLowerCase()
  if (family.includes("embed") || id.includes("embed")) return false
  if (family.includes("tts") || id.includes("tts")) return false
  if (family.includes("image") || id.includes("image")) return false
  if (id.includes("realtime")) return false
  if (id.includes("veo-") || id.includes("lyria-")) return false
  return true
}

export async function fetchModelsCatalog(): Promise<void> {
  if (fetchPromise) return fetchPromise
  fetchPromise = (async () => {
    try {
      const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) {
        logger.warn({ status: res.status }, "[models-catalog] fetch failed")
        return
      }
      catalog = (await res.json()) as Catalog
      lastFetchAt = Date.now()
      logger.info("[models-catalog] catalog loaded")

      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        fetchPromise = null
        fetchModelsCatalog().catch(() => {})
      }, REFRESH_MS)
    } catch (err) {
      logger.warn({ err }, "[models-catalog] fetch error")
    } finally {
      fetchPromise = null
    }
  })()
  return fetchPromise
}

export function getModelsForHarness(harnessId: string): ProviderModel[] | null {
  if (!catalog) return null
  const providerId = HARNESS_TO_PROVIDER[harnessId]
  if (!providerId) return null
  const provider = catalog[providerId]
  if (!provider?.models) return null

  return Object.values(provider.models)
    .filter(isUsableModel)
    .map(toCatalogModel)
}

/**
 * Expand Pi's model list with catalog data. Models from `pi --list-models` are
 * enriched with metadata. Then, for every direct provider in
 * `PI_CATALOG_PROVIDERS`, any catalog model not already present is appended.
 * This surfaces models the user hasn't configured API keys for yet (Pi
 * validates at spawn time, so an unconfigured model gives a clear error).
 */
export function expandPiModels(
  piModels: ProviderModel[],
): ProviderModel[] {
  if (!catalog) return piModels

  const seen = new Set(piModels.map((m) => m.api))
  const result: ProviderModel[] = []

  for (const m of piModels) {
    const catalogModel = findCatalogModel(m.api)
    if (catalogModel) {
      result.push({
        ...m,
        contextWindow: catalogModel.limit?.context,
        maxOutput: catalogModel.limit?.output,
        inputCost: catalogModel.cost?.input,
        outputCost: catalogModel.cost?.output,
        capabilities: {
          reasoning: catalogModel.reasoning,
          toolCall: catalogModel.tool_call,
          structuredOutput: catalogModel.structured_output,
          attachment: catalogModel.attachment,
        },
      })
    } else {
      result.push(m)
    }
  }

  for (const providerId of PI_CATALOG_PROVIDERS) {
    const provider = catalog[providerId]
    if (!provider?.models) continue
    for (const m of Object.values(provider.models)) {
      const api = `${providerId}/${m.id}`
      if (seen.has(api)) continue
      if (!isUsableModel(m)) continue
      seen.add(api)
      result.push({
        id: api,
        label: m.name,
        api,
        contextWindow: m.limit?.context,
        maxOutput: m.limit?.output,
        inputCost: m.cost?.input,
        outputCost: m.cost?.output,
        capabilities: {
          reasoning: m.reasoning,
          toolCall: m.tool_call,
          structuredOutput: m.structured_output,
          attachment: m.attachment,
        },
      })
    }
  }

  return result
}

function findCatalogModel(apiId: string): CatalogModel | undefined {
  if (!catalog) return undefined
  const slashIdx = apiId.indexOf("/")
  if (slashIdx < 0) return undefined
  const providerId = apiId.slice(0, slashIdx)
  const modelSlug = apiId.slice(slashIdx + 1)
  const provider = catalog[providerId]
  if (!provider?.models) return undefined
  return provider.models[modelSlug]
}

export function isCatalogLoaded(): boolean {
  return catalog !== null
}
