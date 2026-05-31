// Single source of truth for the server-side settings blob.
//
// The schema bundles together:
//   - the runtime defaults the server falls back to when a key is missing
//     (consumed by `apps/server/.../settings/service.ts#getSettings`)
//   - the TypeScript shape (`HuxfluxSettings`) consumed by every settings
//     reader / writer on web, server, and mobile
//   - human-readable metadata (label / description / section) reserved for a
//     future generic settings-UI renderer. The metadata is NOT consumed yet;
//     the existing hand-written sections under
//     `apps/web/src/domains/settings/sections/*` continue to render themselves
//     and remain the authoritative client UI for now.
//
// Adding a new server setting: add an entry below. `HuxfluxSettings` and
// `settingsDefaults` derive automatically — no other file needs to change.

// ── Setting type discriminants ────────────────────────────────────────────

type SettingType = "boolean" | "string" | "longtext" | "number" | "select" | "custom"

interface BaseSettingDef {
  type: SettingType
  // Settings tab this control belongs to. Must match a `SettingsSection`.
  section: SettingsSection
  label: string
  description?: string
}

interface BooleanSettingDef extends BaseSettingDef {
  type: "boolean"
  default: boolean
}

interface StringSettingDef extends BaseSettingDef {
  type: "string"
  default: string
  placeholder?: string
}

interface LongTextSettingDef extends BaseSettingDef {
  type: "longtext"
  default: string
  placeholder?: string
}

interface NumberSettingDef extends BaseSettingDef {
  type: "number"
  default: number
  min?: number
  max?: number
  step?: number
}

interface SelectSettingDef extends BaseSettingDef {
  type: "select"
  default: string
  // "models" / "providers" defer option resolution to the renderer (which
  // calls the providers endpoint). An inline array is used for static option
  // sets.
  options: "models" | "providers" | ReadonlyArray<{ value: string; label: string }>
}

interface CustomSettingDef extends BaseSettingDef {
  type: "custom"
  default?: unknown
}

export type SettingDef =
  | BooleanSettingDef
  | StringSettingDef
  | LongTextSettingDef
  | NumberSettingDef
  | SelectSettingDef
  | CustomSettingDef

export type SettingsSection =
  | "general"
  | "models"
  | "providers"
  | "appearance"
  | "git"
  | "review"
  | "servers"
  | "integrations"
  | "experimental"
  | "updates"

// ── The schema ───────────────────────────────────────────────────────────
// `as const satisfies Record<string, SettingDef>` keeps the literal types
// (default values, type discriminants) intact so the derived
// `HuxfluxSettings` shape below can map each key to its concrete value type.

export const settingsSchema = {
  // ── Git ────────────────────────────────────────────────────────────────
  killProcessesOnDone: {
    type: "boolean",
    default: false,
    section: "git",
    label: "Kill processes on done",
    description: "Stop dev servers and processes when agent is marked done or cancelled",
  },
  prCommentMonitoring: {
    type: "boolean",
    default: true,
    section: "git",
    label: "PR comment monitoring",
    description: "Send new PR review comments to agents automatically",
  },
  ciMonitoring: {
    type: "boolean",
    default: true,
    section: "git",
    label: "CI monitoring",
    description: "Notify agents when CI checks fail on their PR",
  },
  pollingIntervalMs: {
    type: "number",
    default: 60_000,
    section: "git",
    label: "Polling interval (ms)",
    description: "How often the server polls GitHub for PR/CI updates",
    min: 5_000,
    max: 600_000,
  },

  // ── Integrations ──────────────────────────────────────────────────────
  jiraBaseUrl: {
    type: "string",
    default: "",
    section: "integrations",
    label: "Jira instance URL",
    placeholder: "https://mycompany.atlassian.net",
  },
  jiraEmail: {
    type: "string",
    default: "",
    section: "integrations",
    label: "Jira email",
    placeholder: "you@company.com",
  },
  jiraApiToken: {
    type: "string",
    default: "",
    section: "integrations",
    label: "Jira API token",
    description: "API token from id.atlassian.com",
  },

  // ── Review ────────────────────────────────────────────────────────────
  reviewPrompt: {
    type: "longtext",
    default: "",
    section: "review",
    label: "Review prompt",
    description: "Custom instructions injected into every AI code review",
  },
  reviewModel: {
    type: "select",
    default: "",
    section: "review",
    label: "Review model",
    description: "Which model to use for AI code reviews",
    options: "models",
  },
  reviewProvider: {
    type: "select",
    default: "",
    section: "review",
    label: "Review provider",
    description: "Which provider to use for AI code reviews",
    options: "providers",
  },

  // ── Models ────────────────────────────────────────────────────────────
  defaultModel: {
    type: "select",
    default: "Sonnet 4.6",
    section: "models",
    label: "Default model",
    description: "Used for new agents unless overridden",
    options: "models",
  },
  defaultProvider: {
    type: "select",
    default: "claude",
    section: "models",
    label: "Default provider",
    description: "Used for new agents unless overridden",
    options: "providers",
  },

  // ── Experimental ──────────────────────────────────────────────────────
  threadsEnabled: {
    type: "boolean",
    default: false,
    section: "experimental",
    label: "Thread agents",
    description: "Allow agents to spawn thread agents in other repos",
  },

  // ── Updates ──────────────────────────────────────────────────────────
  autoUpdateServer: {
    type: "boolean",
    default: true,
    section: "updates",
    label: "Auto-update server",
    description: "Automatically update the Huxflux server when a new version is available",
  },
} as const satisfies Record<string, SettingDef>

// ── Derived types ────────────────────────────────────────────────────────

type SettingValueType<D> =
  D extends { type: "boolean" } ? boolean :
  D extends { type: "number" } ? number :
  D extends { type: "string" | "longtext" | "select" } ? string :
  D extends { type: "custom"; default: infer V } ? V :
  unknown

// Public shape of the persisted settings blob. Every field is optional —
// the on-disk JSON only stores keys the user has explicitly set, and
// consumers fall back to `settingsDefaults` for the rest (the server's
// `getSettings()` spreads the defaults underneath the file contents so
// readers always see a fully-populated object).
export type HuxfluxSettings = {
  [K in keyof typeof settingsSchema]?: SettingValueType<typeof settingsSchema[K]>
}

// ── Runtime defaults ─────────────────────────────────────────────────────
// Typed map of `{ [key]: default }`. Used by the server to backfill any
// missing key when reading settings off disk, and available to any consumer
// that needs to know the canonical default (e.g. resetting a control).

type SettingsDefaults = {
  [K in keyof typeof settingsSchema]: SettingValueType<typeof settingsSchema[K]>
}

export const settingsDefaults: SettingsDefaults = Object.fromEntries(
  Object.entries(settingsSchema).map(([key, def]) => [key, def.default]),
) as SettingsDefaults
