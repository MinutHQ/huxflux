import type { AutomationStep } from "@huxflux/shared"

interface ParsedTrigger {
  type: "schedule" | "event" | "manual"
  interval?: string
  event?: string
}

interface ParsedStep {
  id: string
  type: string
  after: string
  config: Record<string, string>
  label: string
}

interface ParsedConfig {
  schedule?: string
  name?: string
  status?: string
}

interface ParseResult {
  triggers: ParsedTrigger[]
  steps: ParsedStep[]
  removes: string[]
  configs: ParsedConfig[]
}

/** Parse automation XML tags from agent output */
export function parseAutomationTags(text: string): ParseResult {
  const result: ParseResult = { triggers: [], steps: [], removes: [], configs: [] }

  // Parse triggers: <huxflux:auto-trigger type="schedule" interval="1h"/>
  const triggerRe = /<huxflux:auto-trigger\s+([^/]*?)\/>/g
  let m: RegExpExecArray | null
  while ((m = triggerRe.exec(text)) !== null) {
    const attrs = parseAttrs(m[1])
    result.triggers.push({
      type: (attrs.type as any) ?? "manual",
      interval: attrs.interval,
      event: attrs.event,
    })
  }

  // Parse steps: <huxflux:auto-step id="..." type="..." after="...">...</huxflux:auto-step>
  const stepRe = /<huxflux:auto-step\s+([^>]*?)>([\s\S]*?)<\/huxflux:auto-step>/g
  while ((m = stepRe.exec(text)) !== null) {
    const attrs = parseAttrs(m[1])
    const body = m[2].trim()
    const config = parseStepBody(body)
    const label = config.label ?? attrs.type ?? "Step"
    delete config.label

    result.steps.push({
      id: attrs.id ?? `step-${Date.now()}`,
      type: attrs.type ?? "custom",
      after: attrs.after ?? "trigger",
      config,
      label,
    })
  }

  // Parse removes: <huxflux:auto-remove id="..."/>
  const removeRe = /<huxflux:auto-remove\s+id="([^"]+)"\s*\/>/g
  while ((m = removeRe.exec(text)) !== null) {
    result.removes.push(m[1])
  }

  // Parse config updates: <huxflux:auto-config schedule="..." name="..." status="..."/>
  const configRe = /<huxflux:auto-config\s+([^/]*?)\/>/g
  while ((m = configRe.exec(text)) !== null) {
    const attrs = parseAttrs(m[1])
    result.configs.push(attrs as ParsedConfig)
  }

  return result
}

/** Strip all automation XML tags from text (for display) */
export function stripAutomationTags(text: string): string {
  return text
    .replace(/<huxflux:auto-trigger\s+[^/]*?\/>/g, "")
    .replace(/<huxflux:auto-step\s+[^>]*?>[\s\S]*?<\/huxflux:auto-step>/g, "")
    .replace(/<huxflux:auto-remove\s+[^/]*?\/>/g, "")
    .replace(/<huxflux:auto-config\s+[^/]*?\/>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Apply parsed tags to an existing step array, returning the updated array */
export function applyParsedTags(
  existing: AutomationStep[],
  parsed: ParseResult
): { steps: AutomationStep[]; schedule?: string } {
  let steps = [...existing]
  let schedule: string | undefined

  // Handle trigger
  for (const trigger of parsed.triggers) {
    const label = trigger.type === "schedule" ? `Every ${trigger.interval ?? "1h"}`
      : trigger.type === "event" ? `On ${trigger.event ?? "event"}`
      : "Manual trigger"

    const triggerStep: AutomationStep = {
      id: "trigger",
      type: "trigger",
      label,
      config: { triggerType: trigger.type, interval: trigger.interval ?? "", event: trigger.event ?? "" },
      position: { x: 0, y: 0 },
      connections: [],
    }

    const existing_trigger_idx = steps.findIndex(s => s.id === "trigger")
    if (existing_trigger_idx >= 0) {
      triggerStep.connections = steps[existing_trigger_idx].connections
      steps[existing_trigger_idx] = triggerStep
    } else {
      steps.unshift(triggerStep)
    }

    if (trigger.type === "schedule" && trigger.interval) {
      schedule = `every ${trigger.interval}`
    }
  }

  // Handle removes
  for (const removeId of parsed.removes) {
    steps = steps.filter(s => s.id !== removeId)
    // Remove references
    for (const s of steps) {
      s.connections = s.connections.filter(c => c !== removeId)
    }
  }

  // Handle new/updated steps
  for (const step of parsed.steps) {
    const afterBase = step.after.replace(/:true|:false$/, "")
    const newStep: AutomationStep = {
      id: step.id,
      type: step.type as AutomationStep["type"],
      label: step.label,
      config: step.config,
      position: { x: 0, y: 0 },
      connections: [],
    }

    const existingIdx = steps.findIndex(s => s.id === step.id)
    if (existingIdx >= 0) {
      newStep.connections = steps[existingIdx].connections
      steps[existingIdx] = newStep
    } else {
      steps.push(newStep)
    }

    // Wire up connection from the "after" step
    const afterStep = steps.find(s => s.id === afterBase)
    if (afterStep && !afterStep.connections.includes(step.id)) {
      afterStep.connections.push(step.id)
    }
  }

  // Assign positions based on topological order
  assignPositions(steps)

  return { steps, schedule }
}

function assignPositions(steps: AutomationStep[]) {
  const visited = new Set<string>()
  let y = 0

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const step = steps.find(s => s.id === id)
    if (!step) return
    step.position = { x: 0, y }
    y++
    for (const conn of step.connections) {
      visit(conn)
    }
  }

  // Start from trigger
  const trigger = steps.find(s => s.id === "trigger")
  if (trigger) visit(trigger.id)

  // Visit any unvisited
  for (const step of steps) {
    visit(step.id)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAttrs(str: string): Record<string, string> {
  const result: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) {
    result[m[1]] = m[2]
  }
  return result
}

function parseStepBody(body: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of body.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (key && value) result[key] = value
    }
  }
  return result
}
