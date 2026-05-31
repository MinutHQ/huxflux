import { execFileSync, spawn } from "node:child_process"

let _claudeBin: string | null = null
function getClaudeBin(): string {
  if (_claudeBin) return _claudeBin
  if (process.env.CLAUDE_BIN) { _claudeBin = process.env.CLAUDE_BIN; return _claudeBin }
  try { _claudeBin = execFileSync("which", ["claude"], { encoding: "utf8" }).trim() }
  catch { _claudeBin = "claude" }
  return _claudeBin
}

/** Use an LLM to generate a short, descriptive title for a conversation. */
export async function generateTitle(content: string): Promise<string> {
  const prompt = `Generate a short title (max 6 words) for a coding conversation that starts with this message. Return ONLY the title, nothing else. No quotes, no punctuation at the end.\n\nMessage: ${content.slice(0, 500)}`

  return new Promise((resolve, reject) => {
    // `--` marks end-of-flags so a `prompt` starting with "--…" can't be
    // misread by the claude CLI as another option.
    const proc = spawn(getClaudeBin(), [
      "--print",
      "--output-format", "text",
      "--model", "claude-haiku-4-5",
      "--max-turns", "1",
      "--",
      prompt,
    ], { stdio: ["ignore", "pipe", "pipe"] })

    let output = ""
    proc.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })
    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim().slice(0, 60))
      } else {
        reject(new Error(`Title generation failed (exit ${code})`))
      }
    })
    proc.on("error", reject)
  })
}

/** Fallback: derive a short title from the first user message. */
export function deriveTitle(content: string): string {
  const first = content.replace(/\s+/g, " ").trim().split(/[.\n!?]/)[0].trim()
  if (first.length <= 52) return first
  const cut = first.slice(0, 52)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…"
}

/** Slugify a title into a kebab-case branch name. */
export function titleToBranchSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
}
