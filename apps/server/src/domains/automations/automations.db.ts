import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// Drizzle table definitions owned by the automations domain. The centralized
// migration history lives in src/db/index.ts; this file is the source-of-truth
// shape and is re-exported by `src/db/schema.ts` for the backward-compatible
// barrel.

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | active | paused | error
  schedule: text("schedule"), // cron expression or interval like "every 1h"
  /** JSON: array of step nodes [{id, type, label, config, position, connections}] */
  stepsJson: text("steps_json"),
  /** Path to the generated Node.js script on disk */
  scriptPath: text("script_path"),
  /** JSON: state persisted between runs (for diffing, tracking, etc.) */
  stateJson: text("state_json"),
  /** Agent ID of the builder chat agent */
  builderAgentId: text("builder_agent_id"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"), // success | failure | running
  runCount: integer("run_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const automationRuns = sqliteTable("automation_runs", {
  id: text("id").primaryKey(),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // running | success | failure
  output: text("output"), // JSON or text output
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
})

export const automationSkills = sqliteTable("automation_skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Path to the skill script on disk */
  scriptPath: text("script_path").notNull(),
  createdAt: text("created_at").notNull(),
})
