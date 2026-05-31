// Public types for the agent-runner domain.
//
// Callers of `runAgent` provide a list of `TagHandler` instances describing
// which `<huxflux:NAMESPACE.KIND ...>body</huxflux:NAMESPACE.KIND>` tags the
// runner should parse out of the assistant's final message and dispatch.
//
// The runner itself does NOT know any tag ids. Each call site declares the
// tag-id-to-side-effect mapping explicitly. Tag bodies are also stripped from
// the persisted chat content so they never leak into the visible UI.

import type { ZodType, infer as ZodInfer } from "zod/v4"
import type { RunnerOptions } from "../agents/agents.types.js"

export interface ParsedTag {
  /** Namespace portion of the id, e.g. "agents" for "agents.title". */
  namespace: string
  /** Kind portion of the id, e.g. "title" for "agents.title". */
  kind: string
  /** Full dotted id ("agents.title"). */
  id: string
  /** Attribute key/value pairs from the opening tag. */
  attrs: Record<string, string>
  /** Trimmed body content between the open and close tags (empty for self-closing). */
  body: string
}

/**
 * Handler description registered by a `runAgent` caller.
 *
 * The runner walks the parsed tags, finds the handler whose `id` matches the
 * tag's `NAMESPACE.KIND`, validates its `attrs` against the handler's Zod
 * schema, and calls `onTag` with the parsed args + body. Validation failures
 * are logged and the tag is skipped (never thrown).
 */
export interface TagHandler<A extends ZodType = ZodType> {
  /** Fully qualified id, e.g. "agents.title", "tasks.create", "automations.status". */
  id: string
  /** Zod schema describing the expected tag attributes. Use `z.object({})` if none. */
  args: A
  /** Side-effect invoked for each matched tag. */
  onTag: (event: { args: ZodInfer<A>; body: string }) => void | Promise<void>
}

/**
 * Helper that infers the args schema's output type into `onTag`'s signature
 * without forcing every call site to spell out an explicit generic.
 *
 * Example:
 *   defineTagHandler({
 *     id: "tasks.status",
 *     args: z.object({ taskId: z.string(), status: z.string() }),
 *     onTag: ({ args }) => { args.taskId / args.status are typed }
 *   })
 */
export function defineTagHandler<A extends ZodType>(handler: TagHandler<A>): TagHandler<A> {
  return handler
}

/**
 * Options accepted by `runAgent`. Extends the base `RunnerOptions` (which is
 * shared with the agents domain for queueing) with the runner-only contract:
 * caller-provided tag handlers, an optional tag-instructions section to
 * splice into the system prompt, and an optional post-persist hook.
 */
export interface RunAgentOptions extends RunnerOptions {
  /**
   * Tag handlers the runner should dispatch parsed `<huxflux:*>` directives
   * to. The runner has no built-in tag knowledge; every behavior lives here.
   */
  tags?: TagHandler[]
  /**
   * Free-form prose appended to the system prompt to teach the model which
   * tags are available for this call site. The caller owns the wording so the
   * runner stays domain-agnostic.
   */
  tagInstructions?: string
  /**
   * Invoked after the assistant message has been persisted and the
   * `message:done` event fired. Useful for cross-domain side effects that
   * aren't a single tag (e.g. mirroring the message into a linked task).
   * Failures are caught and logged.
   */
  onAssistantMessage?: (event: { content: string }) => void | Promise<void>
}
