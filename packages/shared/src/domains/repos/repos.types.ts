// Cross-platform Zod schema for the registered git repository entity.

import { z } from "zod/v4"

// Nullable string fields use `.nullish()` (accepts `string | null | undefined`)
// because the SQLite columns are nullable and Drizzle returns `null` over the
// wire for unset values. Plain `.optional()` would reject those `null`s and
// the client's `reqValidated` wrapper would throw on every response.
export const repoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  workspacesPath: z.string(),
  branchFrom: z.string(),
  branchPrefix: z.string().nullish(),
  remote: z.string(),
  previewUrl: z.string().nullish(),
  setupScript: z.string().nullish(),
  runScript: z.string().nullish(),
  archiveScript: z.string().nullish(),
  preferences: z.string().nullish(),  // JSON blob: Record<string, string>
  icon: z.string().nullish(),
  poolSize: z.number().nullish(),
  type: z.enum(["git", "folder"]),
  createdAt: z.string(),
})

export type Repo = z.infer<typeof repoSchema>

// Server-accepted body for POST /api/repos. `id`/`createdAt` are server-set;
// `workspacesPath` is optional (server falls back to a default location);
// `type` defaults to "git" server-side when omitted.
export const createRepoBodySchema = repoSchema
  .omit({ id: true, createdAt: true, workspacesPath: true, type: true })
  .extend({
    workspacesPath: z.string().optional(),
    type: z.enum(["git", "folder"]).optional(),
  })

export type CreateRepoBody = z.infer<typeof createRepoBodySchema>

export const updateRepoBodySchema = repoSchema.partial()

export type UpdateRepoBody = z.infer<typeof updateRepoBodySchema>

export const cloneRepoBodySchema = z.object({
  url: z.string(),
  location: z.string(),
  name: z.string().optional(),
})

export type CloneRepoBody = z.infer<typeof cloneRepoBodySchema>

export const quickStartRepoBodySchema = z.object({
  name: z.string(),
  location: z.string(),
  template: z.enum(["empty", "vite", "tanstack-start"]),
})

export type QuickStartRepoBody = z.infer<typeof quickStartRepoBodySchema>

// Filesystem helpers (path picker / repo discovery)
export const fsRepoEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
})

export type FsRepoEntry = z.infer<typeof fsRepoEntrySchema>

export const fsBrowseResponseSchema = z.object({
  path: z.string(),
  dirs: z.array(fsRepoEntrySchema),
})

export type FsBrowseResponse = z.infer<typeof fsBrowseResponseSchema>

export const defaultBranchResponseSchema = z.object({
  branch: z.string(),
})

export type DefaultBranchResponse = z.infer<typeof defaultBranchResponseSchema>
