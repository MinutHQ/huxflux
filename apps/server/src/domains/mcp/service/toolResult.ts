import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { describeApiError, type ApiResult } from "./apiClient.js"

/** Wraps any JSON-serialisable value as a single text content block. */
export function textResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }
}

/** Marks the call as failed so the calling assistant sees the reason. */
export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] }
}

export function apiErrorResult(what: string, result: ApiResult): CallToolResult {
  return errorResult(`${what} failed (HTTP ${result.status}): ${describeApiError(result)}`)
}
