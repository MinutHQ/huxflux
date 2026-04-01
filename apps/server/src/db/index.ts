import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs"
import { dirname } from "node:path"
import { config } from "../config.js"
import * as schema from "./schema.js"

mkdirSync(dirname(config.dbPath), { recursive: true })

// Rolling daily backup: huxflux.db.bak (yesterday) + huxflux.db.bak2 (day before).
// Only rotates once every 24 hours so frequent restarts during development
// don't continuously overwrite the same recovery point.
if (existsSync(config.dbPath)) {
  try {
    const bak = config.dbPath + ".bak"
    const bakAge = existsSync(bak)
      ? Date.now() - statSync(bak).mtimeMs
      : Infinity
    const ONE_DAY = 24 * 60 * 60 * 1000
    if (bakAge > ONE_DAY) {
      // Rotate: .bak → .bak2, then snapshot current DB → .bak
      if (existsSync(bak)) copyFileSync(bak, config.dbPath + ".bak2")
      copyFileSync(config.dbPath, bak)
    }
  } catch { /* non-fatal */ }
}

// Thin shim — makes node:sqlite's DatabaseSync look like better-sqlite3
// so Drizzle's better-sqlite3 adapter works without native bindings.
const raw = new DatabaseSync(config.dbPath)

const sqlite = {
  prepare: (sql: string) => raw.prepare(sql),
  exec: (sql: string) => { raw.exec(sql) },
  pragma: (text: string) => { raw.exec(`PRAGMA ${text}`) },
  transaction: <T>(fn: (...args: unknown[]) => T) => (...args: unknown[]): T => {
    raw.exec("BEGIN")
    try {
      const result = fn(...args)
      raw.exec("COMMIT")
      return result
    } catch (err) {
      try { raw.exec("ROLLBACK") } catch { /* ignore */ }
      throw err
    }
  },
}

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

export const db = drizzle((sql, params, method) => {
  const stmt = raw.prepare(sql)
  if (method === "run") {
    stmt.run(...(params as unknown[]))
    return { rows: [] }
  }
  if (method === "get") {
    const row = stmt.get(...(params as unknown[]))
    return { rows: row ? Object.values(row as object) : [] }
  }
  const rows = stmt.all(...(params as unknown[])) as object[]
  return { rows: rows.map((r) => Object.values(r)) }
}, { schema })

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
  {
    version: 5,
    sql: `
      ALTER TABLE agents ADD COLUMN parent_agent_id TEXT;
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE repos ADD COLUMN preferences TEXT;
    `,
  },
  {
    version: 7,
    sql: `
      ALTER TABLE agents ADD COLUMN session_id TEXT;
    `,
  },
  {
    version: 8,
    sql: `
      ALTER TABLE agents ADD COLUMN no_worktree INTEGER;
    `,
  },
  {
    version: 9,
    sql: `
      ALTER TABLE agents ADD COLUMN deleted_at TEXT;
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

  const currentVersion = (raw.prepare("SELECT version FROM schema_version").get() as { version: number }).version

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion)
  if (pending.length === 0) return

  for (const migration of pending) {
    sqlite.transaction(() => {
      sqlite.exec(migration.sql)
      raw.prepare("UPDATE schema_version SET version = ?").run(migration.version)
    })()
    console.log(`[db] applied migration v${migration.version}`)
  }
}
