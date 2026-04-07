import { DatabaseSync } from "node:sqlite"
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session"
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core"
import { extractTablesRelationalConfig, createTableRelationsHelpers } from "drizzle-orm/relations"
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
      if (existsSync(bak)) copyFileSync(bak, config.dbPath + ".bak2")
      copyFileSync(config.dbPath, bak)
    }
  } catch { /* non-fatal */ }
}

const raw = new DatabaseSync(config.dbPath)

// Shim: makes node:sqlite's DatabaseSync look like better-sqlite3 so that
// drizzle-orm/better-sqlite3/session works without native bindings.
// All methods are typed as `any` because the better-sqlite3 interface isn't
// exported by drizzle and node:sqlite has slightly different TS signatures.
/* eslint-disable @typescript-eslint/no-explicit-any */
function makeStmt(sql: string): any {
  return {
    run:     (...p: any[]) => (raw.prepare(sql) as any).run(...p),
    get:     (...p: any[]) => (raw.prepare(sql) as any).get(...p),
    all:     (...p: any[]) => (raw.prepare(sql) as any).all(...p),
    iterate: (...p: any[]) => (raw.prepare(sql) as any).iterate(...p),
    columns: () => raw.prepare(sql).columns(),
    // raw() returns arrays instead of objects — used by drizzle for mapped queries.
    // setReturnArrays was added in Node 22.6.0; fall back to Object.values for older builds.
    raw: (): any => ({
      get: (...p: any[]) => {
        const s = raw.prepare(sql)
        if (typeof (s as any).setReturnArrays === "function") {
          ;(s as any).setReturnArrays(true)
          return (s as any).get(...p)
        }
        const row = (s as any).get(...p)
        return row ? Object.values(row) : row
      },
      all: (...p: any[]) => {
        const s = raw.prepare(sql)
        if (typeof (s as any).setReturnArrays === "function") {
          ;(s as any).setReturnArrays(true)
          return (s as any).all(...p)
        }
        return ((s as any).all(...p) as any[]).map((r: any) => Object.values(r))
      },
    }),
  }
}

const sqlite: any = {
  prepare: makeStmt,
  exec: (sql: string) => { raw.exec(sql) },
  pragma: (text: string) => { raw.exec(`PRAGMA ${text}`) },
  transaction: (fn: (...args: any[]) => any) => {
    const execute = (...args: any[]) => {
      raw.exec("BEGIN")
      try {
        const result = fn(...args)
        raw.exec("COMMIT")
        return result
      } catch (err) {
        try { raw.exec("ROLLBACK") } catch { /* ignore */ }
        throw err
      }
    }
    execute.deferred  = execute
    execute.immediate = execute
    execute.exclusive = execute
    return execute
  },
}
/* eslint-enable @typescript-eslint/no-explicit-any */

sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

// Build schema config for relational queries
const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers)
const schemaConfig = {
  fullSchema: schema,
  schema: tablesConfig.tables,
  tableNamesMap: tablesConfig.tableNamesMap,
}

const dialect = new SQLiteSyncDialect({})
const session = new BetterSQLiteSession(sqlite, dialect, schemaConfig, {})
// Typed as BetterSQLite3Database shape via BaseSQLiteDatabase<"sync", ...>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = new BaseSQLiteDatabase("sync", dialect, session, schemaConfig) as any

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
  {
    version: 10,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id);
      CREATE INDEX IF NOT EXISTS idx_file_changes_agent_id ON file_changes(agent_id);
      CREATE INDEX IF NOT EXISTS idx_terminal_lines_agent_id ON terminal_lines(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status, deleted_at);
    `,
  },
  {
    version: 11,
    sql: `ALTER TABLE repos ADD COLUMN icon TEXT;`,
  },
  {
    version: 12,
    sql: `
      CREATE TABLE IF NOT EXISTS terminal_tabs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        terminal_id TEXT NOT NULL,
        label TEXT,
        order_idx INTEGER NOT NULL DEFAULT 0,
        UNIQUE(agent_id, terminal_id)
      );
      CREATE INDEX IF NOT EXISTS idx_terminal_tabs_agent_id ON terminal_tabs(agent_id);
      INSERT OR IGNORE INTO terminal_tabs (id, agent_id, terminal_id, label, order_idx)
        SELECT id || '-t1', id, 't1', NULL, 0
        FROM agents WHERE parent_agent_id IS NULL AND deleted_at IS NULL;
    `,
  },
  {
    version: 13,
    sql: `ALTER TABLE agents ADD COLUMN streaming INTEGER DEFAULT 0;`,
  },
  {
    version: 14,
    sql: `
      -- Remove duplicate repos keeping only the earliest created_at per path
      DELETE FROM repos WHERE id NOT IN (
        SELECT id FROM repos GROUP BY path HAVING MIN(created_at)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_path ON repos(path);
    `,
  },
  {
    version: 15,
    sql: `ALTER TABLE agents ADD COLUMN draft TEXT;`,
  },
  {
    version: 16,
    sql: `ALTER TABLE tool_calls ADD COLUMN preceding_text TEXT;`,
  },
]

export function runMigrations() {
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
