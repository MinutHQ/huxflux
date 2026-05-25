import type { AutomationStep } from "@huxflux/shared"
import { getSettings } from "../settings.js"
import { broadcast } from "../ws/handler.js"

interface StepContext {
  automationId: string
  state: Record<string, unknown>
  previousOutput: unknown
}

interface StepResult {
  output: unknown
  notify?: string
  branchResult?: boolean // for conditionals
}

/** Run a single step and return its output */
export async function runStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  switch (step.type) {
    case "trigger":
      return { output: null }

    case "fetch":
      return runFetchStep(step, ctx)

    case "parse":
      return runParseStep(step, ctx)

    case "transform":
      return runTransformStep(step, ctx)

    case "compare":
      return runCompareStep(step, ctx)

    case "conditional":
      return runConditionalStep(step, ctx)

    case "notify":
      return runNotifyStep(step, ctx)

    case "browser":
      return runBrowserStep(step, ctx)

    default:
      return { output: ctx.previousOutput }
  }
}

/** Execute an entire automation flow */
export async function executeFlow(
  steps: AutomationStep[],
  state: Record<string, unknown>,
  automationId: string
): Promise<{ output: unknown; state: Record<string, unknown>; notify?: string }> {
  const ctx: StepContext = { automationId, state, previousOutput: null }
  let lastNotify: string | undefined

  // Build execution order from trigger
  const order = topologicalSort(steps)

  for (const step of order) {
    try {
      const result = await runStep(step, ctx)
      ctx.previousOutput = result.output
      if (result.notify) lastNotify = result.notify

      // For conditionals, skip branches based on result
      if (step.type === "conditional" && result.branchResult !== undefined) {
        // Store branch result so downstream steps can check
        ctx.state[`__branch_${step.id}`] = result.branchResult
      }
    } catch (err: any) {
      console.error(`[automation] step ${step.id} (${step.type}) failed:`, err.message)
      throw new Error(`Step "${step.label}" failed: ${err.message}`)
    }
  }

  return { output: ctx.previousOutput, state: ctx.state, notify: lastNotify }
}

// ── Step implementations ─────────────────────────────────────────────────────

async function runFetchStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const url = step.config.url as string
  if (!url) throw new Error("No URL configured")

  const method = (step.config.method as string) ?? "GET"
  const headers: Record<string, string> = {}

  if (step.config.headers) {
    try {
      Object.assign(headers, JSON.parse(step.config.headers as string))
    } catch {}
  }

  const response = await fetch(url, { method, headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

  const contentType = response.headers.get("content-type") ?? ""
  let data: unknown

  if (contentType.includes("application/json")) {
    data = await response.json()

    // Apply JSON path if specified
    if (step.config.jsonPath) {
      const path = (step.config.jsonPath as string).replace(/^\$\.?/, "").split(".")
      let current: any = data
      for (const key of path) {
        if (current == null) break
        current = current[key]
      }
      data = current
    }
  } else {
    const html = await response.text()

    // Apply CSS selector if specified (basic extraction)
    if (step.config.selector) {
      // Simple text extraction - for real CSS selector support we'd use cheerio
      const selector = step.config.selector as string
      const re = new RegExp(`<[^>]*class="[^"]*${selector.replace(".", "")}[^"]*"[^>]*>([^<]*)`, "gi")
      const matches: string[] = []
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) !== null) matches.push(m[1].trim())
      data = matches.length > 0 ? matches : html.slice(0, 5000)
    } else {
      data = html.slice(0, 5000)
    }
  }

  return { output: data }
}

async function runParseStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  // Parse step works on the previous output
  let data = ctx.previousOutput

  if (step.config.jsonPath && typeof data === "object" && data !== null) {
    const path = (step.config.jsonPath as string).replace(/^\$\.?/, "").split(".")
    let current: any = data
    for (const key of path) {
      if (current == null) break
      current = current[key]
    }
    data = current
  }

  return { output: data }
}

async function runTransformStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const expression = step.config.expression as string
  if (!expression) return { output: ctx.previousOutput }

  try {
    // Safe-ish eval with output in scope
    const fn = new Function("output", `return ${expression}`)
    const result = fn(ctx.previousOutput)
    return { output: result }
  } catch (err: any) {
    throw new Error(`Transform expression failed: ${err.message}`)
  }
}

async function runCompareStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const key = (step.config.key as string) ?? "lastOutput"
  const current = JSON.stringify(ctx.previousOutput)
  const previous = ctx.state[key] as string | undefined

  // Store current for next run
  ctx.state[key] = current

  if (!previous) {
    // First run, no previous state
    return { output: { changed: true, isFirstRun: true, current: ctx.previousOutput, previous: null } }
  }

  const changed = current !== previous
  return {
    output: {
      changed,
      isFirstRun: false,
      current: ctx.previousOutput,
      previous: JSON.parse(previous),
    },
  }
}

async function runConditionalStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const condition = step.config.condition as string
  if (!condition) return { output: ctx.previousOutput, branchResult: true }

  try {
    const fn = new Function("output", `return !!(${condition})`)
    const result = fn(ctx.previousOutput)
    return { output: ctx.previousOutput, branchResult: !!result }
  } catch (err: any) {
    throw new Error(`Condition evaluation failed: ${err.message}`)
  }
}

import { resolve, dirname } from "path"
import { statSync } from "fs"
import { fileURLToPath } from "url"

function getAgentBrowserBin(): string {
  // Use the locally installed binary from node_modules
  try {
    const dir = dirname(fileURLToPath(import.meta.url))
    const localBin = resolve(dir, "../../node_modules/.bin/agent-browser")
    statSync(localBin)
    return localBin
  } catch {}
  // Fallback to global
  return "agent-browser"
}

async function runBrowserStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const { execSync } = await import("child_process")
  const bin = getAgentBrowserBin()

  const commands = (step.config.commands as string ?? "").trim()
  if (!commands) throw new Error("No browser commands configured")

  // Check agent-browser is available
  try {
    execSync(`${bin} --version`, { stdio: "pipe" })
  } catch {
    throw new Error("agent-browser CLI not found. It should be installed as part of the server dependencies.")
  }

  const lines = commands.split("\n").map(l => l.trim()).filter(Boolean)
  const outputs: string[] = []

  for (const line of lines) {
    try {
      const result = execSync(`${bin} ${line}`, {
        encoding: "utf-8",
        timeout: parseInt(step.config.timeout as string) || 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      outputs.push(result.trim())
    } catch (err: any) {
      const stderr = err.stderr?.toString().trim() ?? ""
      const message = stderr || err.message
      // Fail on navigation errors, capture others
      if (line.startsWith("open ") || line.startsWith("goto ")) {
        throw new Error(`Browser command failed: ${line}\n${message}`)
      }
      outputs.push(`[error] ${line}: ${message}`)
    }
  }

  // Close the browser session
  try { execSync(`${bin} close`, { stdio: "pipe", timeout: 5_000 }) } catch {}

  // The last meaningful output is the step result
  const lastOutput = outputs.filter(o => o && !o.startsWith("[error]")).pop() ?? outputs.join("\n")

  // Try to parse as JSON (agent-browser returns JSON for some commands)
  try {
    return { output: JSON.parse(lastOutput) }
  } catch {
    return { output: lastOutput }
  }
}

async function runNotifyStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const method = (step.config.method as string) ?? "in-app"
  const body = interpolate(step.config.body as string ?? String(ctx.previousOutput), ctx.previousOutput)
  const subject = interpolate(step.config.subject as string ?? "Automation Alert", ctx.previousOutput)

  if (method === "email") {
    await sendEmail({
      to: step.config.to as string,
      subject,
      body,
    })
  }

  // Always broadcast in-app notification
  broadcast({
    type: "automation:notification",
    automationId: ctx.automationId,
    message: `${subject}: ${body.slice(0, 200)}`,
  })

  return { output: ctx.previousOutput, notify: `${subject}: ${body.slice(0, 200)}` }
}

// ── Email ────────────────────────────────────────────────────────────────────

async function sendEmail(opts: { to: string; subject: string; body: string }) {
  const settings = getSettings()
  const smtp = (settings as any).smtp as { host?: string; port?: number; user?: string; pass?: string; from?: string } | undefined

  if (!smtp?.host) {
    console.warn("[automation] SMTP not configured, skipping email")
    return
  }

  // Use nodemailer-style transport
  try {
    const nodemailer = await import("nodemailer")
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: (smtp.port ?? 587) === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    })

    await transport.sendMail({
      from: smtp.from ?? smtp.user ?? "huxflux@localhost",
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
    })

    console.log(`[automation] email sent to ${opts.to}: ${opts.subject}`)
  } catch (err: any) {
    console.error(`[automation] email failed:`, err.message)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function interpolate(template: string, output: unknown): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
    const keys = path.split(".")
    let current: any = { output }
    for (const key of keys) {
      if (current == null) return ""
      current = current[key]
    }
    return String(current ?? "")
  })
}

function topologicalSort(steps: AutomationStep[]): AutomationStep[] {
  const visited = new Set<string>()
  const result: AutomationStep[] = []
  const byId = new Map(steps.map(s => [s.id, s]))

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const step = byId.get(id)
    if (!step) return
    result.push(step)
    for (const conn of step.connections) {
      visit(conn.replace(/:true|:false$/, ""))
    }
  }

  // Start from trigger
  if (byId.has("trigger")) visit("trigger")
  // Visit any unvisited
  for (const step of steps) visit(step.id)

  return result
}
