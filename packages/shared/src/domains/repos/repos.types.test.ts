import { describe, it, expect } from "vitest"
import { repoSchema, createRepoBodySchema, updateRepoBodySchema } from "./repos.types.js"

const row = {
  id: "r1", name: "Home", path: "/home/ubuntu", workspacesPath: "/w",
  branchFrom: "", remote: "", createdAt: "2026-01-01T00:00:00.000Z",
}

describe("repoSchema", () => {
  it("defaults type to git for rows from servers that predate folders", () => {
    expect(repoSchema.parse(row).type).toBe("git")
  })

  it("keeps an explicit folder type", () => {
    expect(repoSchema.parse({ ...row, type: "folder" }).type).toBe("folder")
  })

  it("rejects unknown types", () => {
    expect(repoSchema.safeParse({ ...row, type: "svn" }).success).toBe(false)
  })
})

describe("createRepoBodySchema", () => {
  it("leaves type undefined when the client did not choose one", () => {
    const body = createRepoBodySchema.parse({ name: "a", path: "/p", branchFrom: "origin/main", remote: "origin" })
    expect(body.type).toBeUndefined()
  })

  it("passes a folder body through unchanged", () => {
    const body = createRepoBodySchema.parse({ name: "a", path: "/p", branchFrom: "", remote: "", type: "folder" })
    expect(body).toEqual({ name: "a", path: "/p", branchFrom: "", remote: "", type: "folder" })
  })
})

describe("updateRepoBodySchema", () => {
  it("does not inject a type into a patch that did not set one", () => {
    expect(updateRepoBodySchema.parse({ setupScript: "pnpm i" })).toEqual({ setupScript: "pnpm i" })
  })

  it("accepts an explicit type change", () => {
    expect(updateRepoBodySchema.parse({ type: "folder" })).toEqual({ type: "folder" })
  })
})
