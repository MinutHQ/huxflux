import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FastifyInstance } from "fastify"
import { callApi } from "./apiClient.js"
import { apiErrorResult, textResult } from "./toolResult.js"

export interface RepoRow {
  id: string
  name: string
  path: string
  branchFrom: string
  branchPrefix?: string | null
  type?: "git" | "folder" | null
}

/** Fetches every registered repo through the public REST route. */
export async function fetchRepos(app: FastifyInstance) {
  return callApi<RepoRow[]>(app, "GET", "/api/repos")
}

export function registerRepoTools(server: McpServer, app: FastifyInstance): void {
  server.registerTool(
    "list_repos",
    {
      title: "List repositories",
      description:
        "List the repositories registered in Huxflux. Use the returned `id` as `repoId` when calling create_agent.",
      inputSchema: {},
    },
    async () => {
      const result = await fetchRepos(app)
      if (!result.ok) return apiErrorResult("list_repos", result)
      return textResult(
        result.data.map((r) => ({
          id: r.id,
          name: r.name,
          path: r.path,
          type: r.type ?? "git",
          defaultBaseBranch: r.branchFrom,
        })),
      )
    },
  )
}
