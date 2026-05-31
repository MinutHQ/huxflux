import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// Drizzle table definitions owned by the repos domain.
// The centralized migration history lives in src/db/index.ts; this file is
// the source-of-truth shape for repo-related tables. Other domains may import
// `repos` from here (or via the src/db/schema.ts barrel) when they declare
// foreign keys.

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  workspacesPath: text("workspaces_path").notNull(),
  branchFrom: text("branch_from").notNull().default("origin/main"),
  branchPrefix: text("branch_prefix"),
  remote: text("remote").notNull().default("origin"),
  previewUrl: text("preview_url"),
  setupScript: text("setup_script"),
  runScript: text("run_script"),
  archiveScript: text("archive_script"),
  preferences: text("preferences"), // JSON blob: Record<string, string>
  icon: text("icon"),
  poolSize: integer("pool_size").default(0),
  type: text("type").notNull().default("git"), // "git" | "folder"
  createdAt: text("created_at").notNull(),
})
