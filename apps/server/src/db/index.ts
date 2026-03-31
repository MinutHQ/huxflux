import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { config } from "../config.js"
import * as schema from "./schema.js"

const sqlite = new Database(config.dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

export const db = drizzle(sqlite, { schema })

// ── Schema migrations ─────────────────────────────────────────────────────────
//
// Each migration runs exactly once, tracked by a schema_version table.
// To add columns or tables in a future version, append a new entry — never
// edit existing ones (existing installs won't re-run them).

interface Migration {
  version: number
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        workspaces_path TEXT NOT NULL,
        branch_from TEXT NOT NULL DEFAULT 'origin/main',
        remote TEXT NOT NULL DEFAULT 'origin',
        preview_url TEXT,
        setup_script TEXT,
        run_script TEXT,
        archive_script TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        repo_id TEXT REFERENCES repos(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        branch TEXT NOT NULL,
        pr TEXT,
        model TEXT NOT NULL DEFAULT 'Sonnet 4.6',
        location TEXT NOT NULL,
        unread INTEGER DEFAULT 0,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        thinking TEXT,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        parent_id TEXT,
        tool TEXT NOT NULL,
        args TEXT,
        result TEXT,
        duration TEXT,
        order_idx INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS file_changes (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        additions INTEGER NOT NULL DEFAULT 0,
        deletions INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS terminal_lines (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        line TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE messages ADD COLUMN duration_ms INTEGER;
      ALTER TABLE messages ADD COLUMN model TEXT;
      ALTER TABLE messages ADD COLUMN input_tokens INTEGER;
      ALTER TABLE messages ADD COLUMN output_tokens INTEGER;
      ALTER TABLE messages ADD COLUMN cache_read_tokens INTEGER;
      ALTER TABLE messages ADD COLUMN cache_write_tokens INTEGER;
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE agents ADD COLUMN pr_number INTEGER;
      ALTER TABLE agents ADD COLUMN pr_status TEXT;
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE repos ADD COLUMN branch_prefix TEXT;
      ALTER TABLE agents ADD COLUMN base_branch TEXT;
    `,
  },
]

export function runMigrations() {
  // Bootstrap the version tracker
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
    INSERT INTO schema_version (version)
      SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
  `)

  const currentVersion = (sqlite.prepare("SELECT version FROM schema_version").get() as { version: number }).version

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion)
  if (pending.length === 0) return

  for (const migration of pending) {
    sqlite.transaction(() => {
      sqlite.exec(migration.sql)
      sqlite.prepare("UPDATE schema_version SET version = ?").run(migration.version)
    })()
    console.log(`[db] applied migration v${migration.version}`)
  }
}
