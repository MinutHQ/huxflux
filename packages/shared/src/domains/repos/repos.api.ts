import { z } from "zod/v4"
import { reqValidated } from "../../apiBase.js"
import {
  repoSchema,
  createRepoBodySchema,
  cloneRepoBodySchema,
  quickStartRepoBodySchema,
  updateRepoBodySchema,
  fsRepoEntrySchema,
  fsBrowseResponseSchema,
  defaultBranchResponseSchema,
  type CreateRepoBody,
  type CloneRepoBody,
  type QuickStartRepoBody,
  type UpdateRepoBody,
} from "./repos.types.js"

export const reposApi = {
  // Repos
  list: () => reqValidated(z.array(repoSchema), "/api/repos"),
  create: (body: CreateRepoBody) =>
    reqValidated(repoSchema, "/api/repos", {
      method: "POST",
      body: JSON.stringify(createRepoBodySchema.parse(body)),
    }),
  clone: (body: CloneRepoBody) =>
    reqValidated(repoSchema, "/api/repos/clone", {
      method: "POST",
      body: JSON.stringify(cloneRepoBodySchema.parse(body)),
    }),
  quickStart: (body: QuickStartRepoBody) =>
    reqValidated(repoSchema, "/api/repos/quick-start", {
      method: "POST",
      body: JSON.stringify(quickStartRepoBodySchema.parse(body)),
    }),
  update: (id: string, body: UpdateRepoBody) =>
    reqValidated(repoSchema, `/api/repos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateRepoBodySchema.parse(body)),
    }),
  delete: (id: string) => reqValidated(z.void(), `/api/repos/${id}`, { method: "DELETE" }),
  branches: (id: string) => reqValidated(z.array(z.string()), `/api/repos/${id}/branches`),

  // Filesystem (path picker / repo discovery used by the add-repo flow)
  findRepos: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ""
    return reqValidated(z.array(fsRepoEntrySchema), `/api/fs/repos${qs}`)
  },
  browseFs: (path?: string) => {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ""
    return reqValidated(fsBrowseResponseSchema, `/api/fs/browse${qs}`)
  },
  defaultBranch: (repoPath: string) =>
    reqValidated(defaultBranchResponseSchema, `/api/fs/default-branch?path=${encodeURIComponent(repoPath)}`),
}
