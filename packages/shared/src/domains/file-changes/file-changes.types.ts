import { z } from "zod/v4"

/** `branch`: diff vs the merge-base with the base branch. `uncommitted`: diff vs HEAD. */
export const diffBaseSchema = z.enum(["branch", "uncommitted"])
export type DiffBase = z.infer<typeof diffBaseSchema>

export const directoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory"]),
  ignored: z.boolean(),
})
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>

export const fileSearchMatchSchema = z.object({
  path: z.string(),
  line: z.number(),
  preview: z.string(),
})
export type FileSearchMatch = z.infer<typeof fileSearchMatchSchema>

export const fileReadResultSchema = z.object({
  content: z.string().nullable(),
  binary: z.boolean(),
  size: z.number(),
  tooLarge: z.boolean(),
})
export type FileReadResult = z.infer<typeof fileReadResultSchema>
