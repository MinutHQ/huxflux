// Centralized TanStack Query key factory. Use these instead of hand-writing
// `["agents", agentId, "files"]` everywhere — typos in invalidation calls
// silently break cache invalidation, which is one of the hardest classes of
// bug to debug.
//
// Convention:
// - `all`         is the root key for a namespace (use for "invalidate every
//                 query in this namespace").
// - `list()`      is the collection query.
// - `detail(id)`  is the single-entity query.
// - Sub-resources hang off `all` so an `all` invalidation drops them too
//   (e.g. invalidating `agents.all` also drops `agents.ports(id)`).
//
// Some keys carry a `serverUrl` so the same query keyed against a different
// backend server doesn't share cache (see `useAgents` / `useAgents` hooks in
// the shared package).

export const queryKeys = {
  agents: {
    all: ["agents"] as const,
    // `null` and `undefined` both mean "no active server" — collapse to the
    // root key so callers don't need to coerce before invalidating.
    list: (serverUrl?: string | null) =>
      serverUrl == null
        ? ["agents"] as const
        : ["agents", serverUrl] as const,
    // `agentId` accepts `null` so callers that haven't picked an active agent
     // yet (e.g. the workspace root before hydration) can still call this
     // factory without coercing. The `enabled` flag in the hook gates the
     // actual fetch.
    detail: (agentId: string | null | undefined) => ["agent", agentId] as const,
    sessions: (agentId: string) => ["agent-sessions", agentId] as const,
    ports: (agentId: string) => ["agent-ports", agentId] as const,
    allPorts: () => ["all-ports"] as const,
    allDiffs: (agentId: string) => ["all-diffs", agentId] as const,
    diff: (agentId: string, filePath: string) => ["diff", agentId, filePath] as const,
    fileContent: (agentId: string, filePath: string) => ["file-content", agentId, filePath] as const,
    baseFileContent: (agentId: string, filePath: string) => ["file-base-content", agentId, filePath] as const,
    fileTree: (agentId: string) => ["file-tree", agentId] as const,
    mentionPreview: (agentId: string, key: string) => ["mention-preview", agentId, key] as const,
    terminalPreview: (agentId: string) => ["terminal-preview", agentId] as const,
    terminalTabs: (agentId: string) => ["terminal-tabs", agentId] as const,
    // `q` is `null` while no slash is active; the hook still keys the query
     // (so React Query knows when the input string changes).
    slashCommands: (agentId: string | undefined, q: string | null) =>
      ["slash-commands", agentId, q] as const,
    slashCommandsGlobal: (q: string | null) => ["slash-commands", q] as const,
    stats: (serverUrl: string | undefined) => ["stats", serverUrl] as const,
  },
  prs: {
    all: ["prs"] as const,
    list: () => ["prs"] as const,
    // Prefix-only root for invalidating every per-agent PR details query at
    // once (TanStack Query matches by prefix). Use this for "any PR action
    // happened, drop every cached pr-details entry" invalidations.
    detailsRoot: ["pr-details"] as const,
    details: (agentId: string) => ["pr-details", agentId] as const,
    detailsForRepo: (repoId: string, prNumber: number) =>
      ["pr-details-repo", repoId, prNumber] as const,
    files: (repoId: string, prNumber: number) => ["pr-files", repoId, prNumber] as const,
    // `number` is a string in some call sites (when it comes straight from a
     // URL match), a number in others. Accept either — the key is opaque to
     // TanStack Query.
    card: (owner: string, repo: string, number: number | string) =>
      ["pr-card", owner, repo, number] as const,
  },
  settings: {
    all: ["settings"] as const,
    current: () => ["settings"] as const,
    providers: () => ["providers"] as const,
    serverConfig: () => ["server-config"] as const,
  },
  repos: {
    all: ["repos"] as const,
    list: (serverUrl?: string | null) =>
      serverUrl == null
        ? ["repos"] as const
        : ["repos", serverUrl] as const,
    branches: (repoId: string) => ["repo-branches", repoId] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    list: () => ["tasks"] as const,
  },
  automations: {
    all: ["automations"] as const,
    list: () => ["automations"] as const,
    detail: (automationId: string) => ["automation", automationId] as const,
  },
  wrapped: {
    all: ["wrapped"] as const,
  },
} as const
