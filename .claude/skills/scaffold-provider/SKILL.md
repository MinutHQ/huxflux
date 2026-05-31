---
name: scaffold-provider
description: Scaffold a new provider adapter at apps/server/src/domains/providers/service/<id>.ts following the existing pattern (claude, codex, gemini, claudeInteractive). Sets up the ProviderAdapter skeleton, extends ProviderId, registers in the registry.
---

# scaffold-provider

The user wants to add a new provider (Mistral, Cohere, etc.) to the orchestrator. This skill produces a conforming `ProviderAdapter` skeleton plus the wiring.

## Arguments

The user provides:
- The provider id (kebab-case, e.g. `mistral`)
- The expected binary name (e.g. `mistral`, defaults to the id)
- Optional: the env var override name (defaults to `<ID>_BIN`, e.g. `MISTRAL_BIN`)

## What this skill does NOT do

The provider-specific logic, `parseStreamLine` (provider's stream format) and `buildSpawnArgs` (CLI flag construction), cannot be auto-generated. The skill leaves TODO stubs for these. The agent must read the provider's CLI documentation and fill them in.

## Steps

1. **Verify nothing exists yet.** If `apps/server/src/domains/providers/service/<id>.ts` already exists, refuse and tell the user.

2. **Create `apps/server/src/domains/providers/service/<id>.ts`** with a `ProviderAdapter` skeleton:
   - Imports: `createBinaryResolver` from `./binary.js`, the adapter types from `../providers.types.js`
   - `MODELS` array (empty placeholder)
   - `binary = createBinaryResolver({ defaultBin: "<binary>", envVar: "<ENV_VAR>" })`
   - `<id>Provider: ProviderAdapter` with:
     - `id: "<id>"`, `name: "<Display Name>"`
     - Conservative `capabilities` (everything false except basic text streaming)
     - `resolveBinary: binary.resolve`, `isAvailable: binary.isAvailable`
     - `buildSpawnArgs`: stub returning `{ bin, args: [opts.prompt], env: {} }` with a `// TODO` comment
     - `parseStreamLine`: stub returning `null` with a `// TODO` comment
     - `resolveModel`: returns first `MODELS[i].api` or a fallback string
     - `getModels`: returns the `MODELS` array

3. **Extend `apps/server/src/domains/providers/providers.types.ts`** `ProviderId` union to include `"<id>"`.

4. **Register in `apps/server/src/domains/providers/registry.ts`**: import the new adapter and add it to the `providers` map.

5. **Update the README** under "Adding a new provider" if step 1 (scaffold) doesn't already reference `/scaffold-provider`.

6. **Run `pnpm typecheck` and `pnpm lint`** to confirm the scaffold compiles.

7. **Print a TODO checklist** for the agent to complete:
   - Fill in `MODELS` with the provider's actual model ids + display labels
   - Implement `parseStreamLine`, see the "Writing parseStreamLine" section in providers/README.md
   - Implement `buildSpawnArgs`, read the provider CLI's flags from its docs
   - Set realistic `capabilities` (which features the CLI actually supports)
   - Add unit tests at `apps/server/src/domains/providers/service/<id>.test.ts` covering parseStreamLine with at least 6 cases (text chunk, tool use, tool result, session init, error, malformed JSON)

## Do not

- Do not invent the parser logic. Provider stream formats vary; the agent must read the actual CLI documentation.
- Do not add the new id to any UI selector. That's a separate concern.
- Do not introduce optional dependencies. The provider's CLI must be installable via PATH; the adapter uses `createBinaryResolver` for discovery.
