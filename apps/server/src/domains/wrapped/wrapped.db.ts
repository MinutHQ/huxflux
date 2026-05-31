import { sqliteTable, text } from "drizzle-orm/sqlite-core"

// Drizzle table definitions owned by the wrapped domain. Stores cached
// AI-generated "Wrapped" period summaries. The centralized migration history
// lives in src/db/index.ts.

export const wrappedSummaries = sqliteTable("wrapped_summaries", {
  id: text("id").primaryKey(),
  periodKey: text("period_key").notNull().unique(),
  summary: text("summary").notNull(),
  statsJson: text("stats_json").notNull(),
  createdAt: text("created_at").notNull(),
})
