import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { config } from "../config.js"
import * as schema from "./schema.js"

const sqlite = new Database(config.dbPath)

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL")
sqlite.pragma("foreign_keys = ON")

export const db = drizzle(sqlite, { schema })

// Run inline migrations on startup (simple approach — no migration runner needed for a POC)
export function runMigrations() {
  sqlite.exec(`
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
  `)
}
