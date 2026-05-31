import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod/v4"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { db } from "../../../db/index.js"
import { agents as agentsTable, repos as reposTable } from "../../../db/schema.js"
import { eq } from "drizzle-orm"
import type { SlashCommand } from "../agents.types.js"

const idParamsSchema = z.object({ id: z.string() })
const qQuerySchema = z.object({ q: z.string().optional() })

// Built-in commands always available
const BUILTIN_COMMANDS: Omit<SlashCommand, "source">[] = [
  { name: "review",   description: "Review the current changes and provide feedback" },
  { name: "commit",   description: "Stage and commit all changes with an auto-generated message" },
  { name: "pr",       description: "Create a pull request for the current branch" },
  { name: "test",     description: "Run the test suite and report results" },
  { name: "fix",      description: "Fix any failing tests or lint errors", args: "[error message]" },
  { name: "explain",  description: "Explain the most recent changes made" },
  { name: "rollback", description: "Revert the last set of changes" },
  { name: "diff",     description: "Summarise the current diff in plain language" },
  { name: "push",     description: "Push the current branch to origin" },
  { name: "clear",    description: "Clear the conversation history for this agent" },
]

/** Parse YAML-style frontmatter from a markdown file. Returns null if no frontmatter. */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const result: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    result[key] = value
  }
  return result
}

/** Load skills from a skills directory (e.g. ~/.claude/skills or <repo>/.claude/skills) */
async function loadSkillsFromDir(skillsDir: string): Promise<SlashCommand[]> {
  const commands: SlashCommand[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(skillsDir)
  } catch {
    return commands
  }
  for (const entry of entries) {
    const skillFile = path.join(skillsDir, entry, "SKILL.md")
    let content: string
    try {
      content = await fs.readFile(skillFile, "utf8")
    } catch {
      continue
    }
    const fm = parseFrontmatter(content)
    const name = fm?.name ?? entry
    const description = fm?.description ?? `Custom skill: ${name}`
    const args = fm?.["argument-hint"]
    commands.push({ name, description, args, source: "skill" })
  }
  return commands
}

async function getAllCommands(extraSkillsDirs: string[] = []): Promise<SlashCommand[]> {
  const builtins: SlashCommand[] = BUILTIN_COMMANDS.map((c) => ({ ...c, source: "builtin" }))

  // Global skills: ~/.claude/skills
  const globalSkillsDir = path.join(os.homedir(), ".claude", "skills")
  const globalSkills = await loadSkillsFromDir(globalSkillsDir)

  // Extra dirs (e.g. project-level .claude/skills)
  const extraSkills: SlashCommand[] = []
  for (const dir of extraSkillsDirs) {
    const skills = await loadSkillsFromDir(dir)
    extraSkills.push(...skills)
  }

  // Deduplicate by name: extra > global > builtin
  const seen = new Set<string>()
  const all: SlashCommand[] = []
  for (const cmd of [...extraSkills, ...globalSkills, ...builtins]) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name)
      all.push(cmd)
    }
  }
  return all
}

function filterCommands(commands: SlashCommand[], q: string | undefined): SlashCommand[] {
  if (!q) return commands
  const lower = q.toLowerCase()
  const nameMatches = commands.filter((c) => c.name.includes(lower))
  const descMatches = commands.filter((c) => !c.name.includes(lower) && c.description.toLowerCase().includes(lower))
  return [...nameMatches, ...descMatches]
}

export const slashCommandsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/slash-commands?q=<search>
  app.get("/api/slash-commands", {
    schema: { querystring: qQuerySchema },
  }, async (req) => {
    const commands = await getAllCommands()
    return filterCommands(commands, req.query.q)
  })

  // GET /api/agents/:id/slash-commands?q=<search>
  // Also checks for project-level .claude/skills in the agent's repo
  app.get(
    "/api/agents/:id/slash-commands",
    { schema: { params: idParamsSchema, querystring: qQuerySchema } },
    async (req) => {
      const agent = db.select().from(agentsTable).where(eq(agentsTable.id, req.params.id)).get()
      const extraDirs: string[] = []
      if (agent?.repoId) {
        const repo = db.select().from(reposTable).where(eq(reposTable.id, agent.repoId)).get()
        if (repo) {
          extraDirs.push(path.join(repo.path, ".claude", "skills"))
          // Also check the worktree itself
          const worktreePath = path.join(repo.workspacesPath, agent.location)
          extraDirs.push(path.join(worktreePath, ".claude", "skills"))
        }
      }
      const commands = await getAllCommands(extraDirs)
      return filterCommands(commands, req.query.q)
    }
  )
}
