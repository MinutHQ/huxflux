import { DatabaseSync } from "node:sqlite"
import { BetterSQLiteSession } from "drizzle-orm/better-sqlite3/session"
import { BaseSQLiteDatabase, SQLiteSyncDialect } from "drizzle-orm/sqlite-core"
import { extractTablesRelationalConfig, createTableRelationsHelpers } from "drizzle-orm/relations"
import { getTableColumns, getTableName } from "drizzle-orm"
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

// Shim: makes node:sqlite's DatabaseSync look like better-sqlite3 so that
// drizzle-orm/better-sqlite3/session works without native bindings.
// All methods are typed as `any` because the better-sqlite3 interface isn't
// exported by drizzle and node:sqlite has slightly different TS signatures.
/* eslint-disable @typescript-eslint/no-explicit-any */
function buildSqliteShim(raw: DatabaseSync) {
  function makeStmt(sql: string): any {
    return {
      run:     (...p: any[]) => (raw.prepare(sql) as any).run(...p),
      get:     (...p: any[]) => (raw.prepare(sql) as any).get(...p),
      all:     (...p: any[]) => (raw.prepare(sql) as any).all(...p),
      iterate: (...p: any[]) => (raw.prepare(sql) as any).iterate(...p),
      columns: () => raw.prepare(sql).columns(),
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
  return sqlite
}

// Build schema config for relational queries
const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers)
const schemaConfig = {
  fullSchema: schema,
  schema: tablesConfig.tables,
  tableNamesMap: tablesConfig.tableNamesMap,
}

const dialect = new SQLiteSyncDialect({})

/** Build a Drizzle DB instance backed by the given raw node:sqlite handle. */
export function createDbFromRaw(rawDb: DatabaseSync): { db: any; sqlite: any; raw: DatabaseSync } {
  const sqlite = buildSqliteShim(rawDb)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const session = new BetterSQLiteSession(sqlite, dialect, schemaConfig, {})
  const drizzleDb = new BaseSQLiteDatabase("sync", dialect, session, schemaConfig) as any
  return { db: drizzleDb, sqlite, raw: rawDb }
}

const production = createDbFromRaw(new DatabaseSync(config.dbPath))
let _activeDb: any = production.db
let _activeSqlite: any = production.sqlite
let _activeRaw: DatabaseSync = production.raw

// Proxy so cross-file `import { db }` references see whichever backing instance
// is currently active. Tests use `setDb(...)` to swap in an in-memory instance
// per test; production code never reassigns. The reflection here is a thin
// passthrough — the underlying Drizzle methods do their own binding.
export const db: any = new Proxy({}, {
  get(_target, prop) {
    const value = _activeDb[prop]
    return typeof value === "function" ? value.bind(_activeDb) : value
  },
  set(_target, prop, value) {
    _activeDb[prop] = value
    return true
  },
  has(_target, prop) { return prop in _activeDb },
})

/**
 * Swap the active Drizzle handle. Test-only helper: pass an instance returned
 * by `createDbFromRaw(new DatabaseSync(":memory:"))` to point every consumer at
 * an isolated in-memory database. The companion `sqlite` shim and raw handle
 * are stored alongside so `runMigrations` operates on the same backing.
 */
export function setDb(next: { db: any; sqlite: any; raw: DatabaseSync }): void {
  _activeDb = next.db
  _activeSqlite = next.sqlite
  _activeRaw = next.raw
}

/** Restore the production-backed DB. Test-only. */
export function _resetDb(): void {
  _activeDb = production.db
  _activeSqlite = production.sqlite
  _activeRaw = production.raw
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  {
    version: 17,
    sql: `
      CREATE TABLE IF NOT EXISTS pr_chat_messages (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        is_review INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pr_chat_messages_pr ON pr_chat_messages(repo_id, pr_number, created_at);
    `,
  },
  {
    version: 18,
    sql: `
      CREATE TABLE IF NOT EXISTS wrapped_summaries (
        id TEXT PRIMARY KEY,
        period_key TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        stats_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wrapped_period ON wrapped_summaries(period_key);
    `,
  },
  {
    version: 19,
    sql: `ALTER TABLE messages ADD COLUMN sender TEXT;`,
  },
  {
    version: 20,
    sql: `ALTER TABLE agents ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';`,
  },
  {
    version: 21,
    sql: `
      ALTER TABLE pr_chat_messages ADD COLUMN review_head_sha TEXT;
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        jira_key TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT,
        assignee TEXT,
        project_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE TABLE IF NOT EXISTS task_agents (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_agents_unique ON task_agents(task_id, agent_id);
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
    `,
  },
  {
    version: 22,
    sql: `
      ALTER TABLE tasks ADD COLUMN sprint_name TEXT;
      ALTER TABLE tasks ADD COLUMN sprint_state TEXT;
    `,
  },
  {
    version: 23,
    sql: `
      ALTER TABLE tasks ADD COLUMN repo_id TEXT REFERENCES repos(id);
      ALTER TABLE task_comments ADD COLUMN agent_id TEXT;
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, depends_on_task_id)
      );
      CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_deps_dep ON task_dependencies(depends_on_task_id);
    `,
  },
  {
    version: 24,
    sql: `ALTER TABLE agents ADD COLUMN task_id TEXT;`,
  },
  {
    version: 25,
    sql: `ALTER TABLE repos ADD COLUMN pool_size INTEGER DEFAULT 0;`,
  },
  {
    version: 26,
    sql: `
      CREATE TABLE IF NOT EXISTS worktree_pool (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        location TEXT NOT NULL,
        branch TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_worktree_pool_repo ON worktree_pool(repo_id);
    `,
  },
  {
    version: 27,
    sql: `
      CREATE TABLE IF NOT EXISTS agent_ports (
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        port INTEGER NOT NULL,
        PRIMARY KEY (agent_id, port)
      );
    `,
  },
  {
    version: 28,
    sql: `
      ALTER TABLE agents ADD COLUMN pr_comment_monitoring INTEGER;
      ALTER TABLE agents ADD COLUMN ci_monitoring INTEGER;
    `,
  },
  {
    version: 29,
    sql: `ALTER TABLE agents ADD COLUMN thread_parent_id TEXT;`,
  },
  {
    version: 30,
    sql: `
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        schedule TEXT,
        steps_json TEXT,
        script_path TEXT,
        state_json TEXT,
        builder_agent_id TEXT,
        last_run_at TEXT,
        last_run_status TEXT,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
      CREATE TABLE IF NOT EXISTS automation_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        script_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 31,
    sql: `ALTER TABLE repos ADD COLUMN type TEXT NOT NULL DEFAULT 'git';`,
  },
  {
    version: 32,
    sql: `ALTER TABLE agents ADD COLUMN pinned INTEGER DEFAULT 0;`,
  },
]

export function runMigrations() {
  _activeSqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
    INSERT INTO schema_version (version)
      SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
  `)

  const currentVersion = (_activeRaw.prepare("SELECT version FROM schema_version").get() as { version: number }).version

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion)
  if (pending.length === 0) {
    console.info(`[db] schema up to date (v${currentVersion})`)
  } else {
    console.info(`[db] running ${pending.length} migration(s) from v${currentVersion}...`)
    for (const migration of pending) {
      // Run DDL outside transactions — node:sqlite's shim silently swallows
      // ALTER TABLE and other DDL inside transaction wrappers.
      try {
        _activeSqlite.exec(migration.sql)
      } catch (err) {
        const msg = (err as Error).message ?? ""
        // Ignore "duplicate column" errors — column may have been added manually
        if (!msg.includes("duplicate column")) throw err
        console.info(`[db] migration v${migration.version}: column already exists, skipping`)
      }
      _activeRaw.prepare("UPDATE schema_version SET version = ?").run(migration.version)
      console.info(`[db] applied migration v${migration.version}`)
    }
    console.info(`[db] migrations complete (now v${pending[pending.length - 1].version})`)
  }

  repairSchema()
}

// Fix columns that were lost due to ALTER TABLE being silently swallowed
// inside node:sqlite transactions in earlier versions of the migration runner.
// Derives expected columns from the Drizzle schema so new migrations are
// automatically covered without manual bookkeeping.
function repairSchema() {
  const tables = [
    schema.repos, schema.agents, schema.messages, schema.toolCalls,
    schema.fileChanges, schema.terminalLines, schema.terminalTabs,
    schema.wrappedSummaries,
  ]

  for (const table of tables) {
    const tableName = getTableName(table)
    const existing = new Set(
      (_activeRaw.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map((c) => c.name)
    )
    // Table doesn't exist yet — nothing to repair (CREATE TABLE migration will handle it)
    if (existing.size === 0) continue

    const columns = getTableColumns(table)
    for (const col of Object.values(columns)) {
      if (!existing.has(col.name)) {
        _activeSqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.getSQLType()}`)
        console.info(`[db] repaired: added missing ${tableName}.${col.name}`)
      }
    }
  }
}
