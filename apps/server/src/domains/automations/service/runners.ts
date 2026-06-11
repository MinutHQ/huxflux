import type { AutomationStep } from "../automations.types.js"
import { getSettings } from "../../settings/settings.service.js"
import { automationsWs } from "../automations.ws.js"
import { logger } from "../../../logger.js"

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

function configString(step: AutomationStep, key: string): string | undefined {
  const v = step.config[key]
  return typeof v === "string" ? v : undefined
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Run a single step and return its output. */
export async function runStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  switch (step.type) {
    case "trigger":
      return { output: null }

    case "fetch":
      return runFetchStep(step)

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
      return runBrowserStep(step)

    default:
      return { output: ctx.previousOutput }
  }
}

/** Execute an entire automation flow. */
export async function executeFlow(
  steps: AutomationStep[],
  state: Record<string, unknown>,
  automationId: string,
): Promise<{ output: unknown; state: Record<string, unknown>; notify?: string }> {
  const ctx: StepContext = { automationId, state, previousOutput: null }
  let lastNotify: string | undefined

  const order = topologicalSort(steps)

  for (const step of order) {
    try {
      const result = await runStep(step, ctx)
      ctx.previousOutput = result.output
      if (result.notify) lastNotify = result.notify

      if (step.type === "conditional" && result.branchResult !== undefined) {
        ctx.state[`__branch_${step.id}`] = result.branchResult
      }
    } catch (err) {
      const msg = errorMessage(err)
      logger.error({ err: msg }, `[automation] step ${step.id} (${step.type}) failed`)
      throw new Error(`Step "${step.label}" failed: ${msg}`)
    }
  }

  return { output: ctx.previousOutput, state: ctx.state, notify: lastNotify }
}

// ── Step implementations ─────────────────────────────────────────────────────

async function runFetchStep(step: AutomationStep): Promise<StepResult> {
  const url = configString(step, "url")
  if (!url) throw new Error("No URL configured")

  const method = configString(step, "method") ?? "GET"
  const headers: Record<string, string> = {}

  const headersRaw = configString(step, "headers")
  if (headersRaw) {
    try {
      Object.assign(headers, JSON.parse(headersRaw))
    } catch {
      // ignore bad JSON headers
    }
  }

  const response = await fetch(url, { method, headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

  const contentType = response.headers.get("content-type") ?? ""
  const jsonPath = configString(step, "jsonPath")
  if (contentType.includes("application/json")) {
    const json = await response.json()
    return { output: jsonPath ? walkJsonPath(json, jsonPath) : json }
  }
  return { output: extractFromHtml(await response.text(), configString(step, "selector")) }
}

function walkJsonPath(data: unknown, jsonPath: string): unknown {
  const keys = jsonPath.replace(/^\$\.?/, "").split(".")
  let current: unknown = data
  for (const key of keys) {
    if (current == null || typeof current !== "object") return current
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function extractFromHtml(html: string, selector: string | undefined): unknown {
  if (!selector) return html.slice(0, 5000)
  // Simple text extraction. Real CSS selector support would need cheerio.
  const re = new RegExp(`<[^>]*class="[^"]*${selector.replace(".", "")}[^"]*"[^>]*>([^<]*)`, "gi")
  const matches: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) matches.push(m[1].trim())
  return matches.length > 0 ? matches : html.slice(0, 5000)
}

async function runParseStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  let data = ctx.previousOutput
  const jsonPath = configString(step, "jsonPath")
  if (jsonPath && typeof data === "object" && data !== null) {
    data = walkJsonPath(data, jsonPath)
  }
  return { output: data }
}

async function runTransformStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const expression = configString(step, "expression")
  if (!expression) return { output: ctx.previousOutput }

  try {
    const fn = new Function("output", `return ${expression}`)
    const result = fn(ctx.previousOutput)
    return { output: result }
  } catch (err) {
    throw new Error(`Transform expression failed: ${errorMessage(err)}`)
  }
}

async function runCompareStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const key = configString(step, "key") ?? "lastOutput"
  const current = JSON.stringify(ctx.previousOutput)
  const previous = ctx.state[key] as string | undefined

  ctx.state[key] = current

  if (!previous) {
    return { output: { changed: true, isFirstRun: true, current: ctx.previousOutput, previous: null } }
  }

  return {
    output: {
      changed: current !== previous,
      isFirstRun: false,
      current: ctx.previousOutput,
      previous: JSON.parse(previous),
    },
  }
}

async function runConditionalStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const condition = configString(step, "condition")
  if (!condition) return { output: ctx.previousOutput, branchResult: true }

  try {
    const fn = new Function("output", `return !!(${condition})`)
    const result = fn(ctx.previousOutput)
    return { output: ctx.previousOutput, branchResult: !!result }
  } catch (err) {
    throw new Error(`Condition evaluation failed: ${errorMessage(err)}`)
  }
}

function getAgentBrowserBin(): string {
  return "agent-browser"
}

async function runBrowserStep(step: AutomationStep): Promise<StepResult> {
  const { execSync } = await import("child_process")
  const bin = getAgentBrowserBin()

  const commands = (configString(step, "commands") ?? "").trim()
  if (!commands) throw new Error("No browser commands configured")

  try {
    execSync(`${bin} --version`, { stdio: "pipe" })
  } catch {
    throw new Error("agent-browser CLI not found. Install it with: npm install -g agent-browser")
  }

  const lines = commands.split("\n").map(l => l.trim()).filter(Boolean)
  const outputs: string[] = []

  for (const line of lines) {
    try {
      const result = execSync(`${bin} ${line}`, {
        encoding: "utf-8",
        timeout: parseInt(configString(step, "timeout") ?? "") || 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      outputs.push(result.trim())
    } catch (err) {
      const stderr = (err as { stderr?: { toString(): string } }).stderr?.toString().trim() ?? ""
      const message = stderr || errorMessage(err)
      if (line.startsWith("open ") || line.startsWith("goto ")) {
        throw new Error(`Browser command failed: ${line}\n${message}`)
      }
      outputs.push(`[error] ${line}: ${message}`)
    }
  }

  try {
    execSync(`${bin} close`, { stdio: "pipe", timeout: 5_000 })
  } catch {
    // best-effort cleanup
  }

  const lastOutput = outputs.filter(o => o && !o.startsWith("[error]")).pop() ?? outputs.join("\n")

  try {
    return { output: JSON.parse(lastOutput) }
  } catch {
    return { output: lastOutput }
  }
}

async function runNotifyStep(step: AutomationStep, ctx: StepContext): Promise<StepResult> {
  const method = configString(step, "method") ?? "in-app"
  const body = interpolate(configString(step, "body") ?? String(ctx.previousOutput), ctx.previousOutput)
  const subject = interpolate(configString(step, "subject") ?? "Automation Alert", ctx.previousOutput)

  if (method === "email") {
    await sendEmail({
      to: configString(step, "to") ?? "",
      subject,
      body,
    })
  }

  automationsWs.notification(ctx.automationId, `${subject}: ${body.slice(0, 200)}`)

  return { output: ctx.previousOutput, notify: `${subject}: ${body.slice(0, 200)}` }
}

// ── Email ────────────────────────────────────────────────────────────────────

interface SmtpSettings {
  host?: string
  port?: number
  user?: string
  pass?: string
  from?: string
}

async function sendEmail(opts: { to: string; subject: string; body: string }) {
  const settings = getSettings() as Record<string, unknown>
  const smtp = settings.smtp as SmtpSettings | undefined

  if (!smtp?.host) {
    logger.warn("[automation] SMTP not configured, skipping email")
    return
  }

  // nodemailer is an optional runtime dep installed on demand.
  try {
    // @ts-expect-error optional runtime dep, not installed by default
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

    logger.info(`[automation] email sent to ${opts.to}: ${opts.subject}`)
  } catch (err) {
    logger.error({ err: errorMessage(err) }, `[automation] email failed`)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function interpolate(template: string, output: unknown): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, path: string) => {
    const keys = path.split(".")
    let current: unknown = { output }
    for (const key of keys) {
      if (current == null || typeof current !== "object") return ""
      current = (current as Record<string, unknown>)[key]
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

  if (byId.has("trigger")) visit("trigger")
  for (const step of steps) visit(step.id)

  return result
}
