import { describe, it, expect } from "vitest"
import { buildRepoInsert, buildRepoPatch } from "./repos.service.js"

describe("buildRepoInsert", () => {
  it("keeps the folder type and every optional column the client sent", () => {
    const row = buildRepoInsert(
      {
        name: "notes",
        path: "/tmp/notes",
        workspacesPath: "/tmp/ws",
        branchFrom: "",
        remote: "",
        type: "folder",
        icon: "notebook",
        archiveScript: "echo bye",
        preferences: "{\"a\":\"b\"}",
        poolSize: 2,
      },
      "id-1",
      "2026-01-01T00:00:00.000Z",
    )
    expect(row.type).toBe("folder")
    expect(row.icon).toBe("notebook")
    expect(row.archiveScript).toBe("echo bye")
    expect(row.preferences).toBe("{\"a\":\"b\"}")
    expect(row.poolSize).toBe(2)
    expect(row.workspacesPath).toBe("/tmp/ws")
    expect(row.branchFrom).toBe("")
    expect(row.remote).toBe("")
    expect(row.id).toBe("id-1")
    expect(row.createdAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("falls back to git defaults when optional columns are missing", () => {
    const row = buildRepoInsert(
      { name: "app", path: "/tmp/app", branchFrom: "origin/main", remote: "origin" },
      "id-2",
      "now",
    )
    expect(row.type).toBe("git")
    expect(row.icon).toBeNull()
    expect(row.archiveScript).toBeNull()
    expect(row.preferences).toBeNull()
    expect(row.poolSize).toBe(0)
    expect(row.previewUrl).toBeNull()
    expect(row.setupScript).toBeNull()
    expect(row.runScript).toBeNull()
    expect(row.branchPrefix).toBeNull()
    expect(row.workspacesPath.endsWith("/app")).toBe(true)
  })
})

describe("buildRepoPatch", () => {
  it("includes only the keys that were sent, including explicit nulls", () => {
    const patch = buildRepoPatch({
      setupScript: "pnpm i",
      previewUrl: undefined,
      branchPrefix: null as unknown as string,
      type: "folder",
      archiveScript: "rm -rf dist",
      preferences: "{}",
      poolSize: 3,
    })
    expect(patch).toEqual({
      setupScript: "pnpm i",
      branchPrefix: null,
      type: "folder",
      archiveScript: "rm -rf dist",
      preferences: "{}",
      poolSize: 3,
    })
    expect("previewUrl" in patch).toBe(false)
  })

  it("ignores unknown and server-owned keys", () => {
    const patch = buildRepoPatch({ id: "x", createdAt: "y", name: "renamed" } as never)
    expect(patch).toEqual({ name: "renamed" })
  })

  it("returns an empty object for an empty body", () => {
    expect(buildRepoPatch({})).toEqual({})
  })
})
