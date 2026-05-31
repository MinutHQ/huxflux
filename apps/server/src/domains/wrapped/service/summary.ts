import { execFileSync, spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { db } from "../../../db/index.js"
import { wrappedSummaries } from "../../../db/schema.js"

let _claudeBin: string | null = null
function getClaudeBin(): string {
  if (_claudeBin) return _claudeBin
  if (process.env.CLAUDE_BIN) { _claudeBin = process.env.CLAUDE_BIN; return _claudeBin }
  try { _claudeBin = execFileSync("which", ["claude"], { encoding: "utf8" }).trim() }
  catch { _claudeBin = "claude" }
  return _claudeBin
}

/**
 * Spawn the local Claude CLI in `--print` mode against a haiku model to turn
 * the prompt into a single chunk of narrative text. Times out at 30 seconds.
 */
export function generateSummary(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getClaudeBin(), [
      "--print",
      "--output-format", "text",
      "--model", "claude-haiku-4-5",
      "--max-turns", "1",
      prompt,
    ], { stdio: ["ignore", "pipe", "pipe"] })

    let output = ""
    proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error("Summary generation timed out"))
    }, 30_000)

    proc.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0 && output.trim()) {
        resolve(output.trim())
      } else {
        reject(new Error(`Summary generation failed (exit ${code})`))
      }
    })
    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/**
 * Upsert a generated summary keyed by the period cache key. Race-free under
 * rapid regenerate clicks because `onConflictDoUpdate` is a single statement.
 */
export function upsertSummary(periodKey: string, summary: string, statsJson: string): void {
  db.insert(wrappedSummaries).values({
    id: randomUUID(),
    periodKey,
    summary,
    statsJson,
    createdAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: wrappedSummaries.periodKey,
    set: {
      summary,
      statsJson,
      createdAt: new Date().toISOString(),
    },
  }).run()
}
