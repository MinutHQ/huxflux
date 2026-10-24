import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { HuxfluxApiError, MAX_SHARED_FILE_BYTES } from "@huxflux/shared"
import {
  ShareFileError, parseSharedFiles, removeSharedFiles, resolveSharedFile, shareFile, sharedFilesDir,
} from "./sharedFiles.js"

const AGENT_ID = "agent-share-1"

let root: string
let cwd: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hux-share-root-"))
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hux-share-cwd-"))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(cwd, { recursive: true, force: true })
})

async function expectShareError(p: Promise<unknown>, message: RegExp): Promise<void> {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ShareFileError)
  expect((err as Error).message).toMatch(message)
}

describe("shareFile", () => {
  it("copies a relative path into the agent's store under a prefixed name", async () => {
    fs.mkdirSync(path.join(cwd, "out"))
    fs.writeFileSync(path.join(cwd, "out", "app-release.apk"), "apk-bytes")
    const shared = await shareFile(AGENT_ID, "out/app-release.apk", cwd, root)
    expect(shared.name).toBe("app-release.apk")
    expect(shared.size).toBe(9)
    expect(shared.file).toMatch(/^[0-9a-f]{8}-app-release\.apk$/)
    const stored = path.join(sharedFilesDir(AGENT_ID, root), shared.file)
    expect(fs.readFileSync(stored, "utf8")).toBe("apk-bytes")
  })

  it("accepts absolute paths outside the working directory", async () => {
    const outside = path.join(root, "elsewhere.zip")
    fs.writeFileSync(outside, "zip")
    const shared = await shareFile(AGENT_ID, outside, cwd, root)
    expect(shared.name).toBe("elsewhere.zip")
  })

  it("keeps an earlier snapshot when the same file is shared again after a rebuild", async () => {
    const src = path.join(cwd, "app.apk")
    fs.writeFileSync(src, "v1")
    const first = await shareFile(AGENT_ID, "app.apk", cwd, root)
    fs.writeFileSync(src, "v2")
    const second = await shareFile(AGENT_ID, "app.apk", cwd, root)
    expect(second.file).not.toBe(first.file)
    expect(fs.readFileSync(path.join(sharedFilesDir(AGENT_ID, root), first.file), "utf8")).toBe("v1")
    expect(fs.readFileSync(path.join(sharedFilesDir(AGENT_ID, root), second.file), "utf8")).toBe("v2")
  })

  it("keeps spaces and non-ASCII in the stored name so the download matches the chip", async () => {
    fs.writeFileSync(path.join(cwd, "résumé (1).pdf"), "pdf")
    const shared = await shareFile(AGENT_ID, "résumé (1).pdf", cwd, root)
    expect(shared.name).toBe("résumé (1).pdf")
    expect(shared.file).toMatch(/^[0-9a-f]{8}-résumé \(1\)\.pdf$/)
  })

  it("replaces control characters and backslashes in the stored name", async () => {
    fs.writeFileSync(path.join(cwd, "a\\b\tc.txt"), "x")
    const shared = await shareFile(AGENT_ID, "a\\b\tc.txt", cwd, root)
    expect(shared.file).toMatch(/^[0-9a-f]{8}-a_b_c\.txt$/)
  })

  it("rejects a missing file", async () => {
    await expectShareError(shareFile(AGENT_ID, "nope.apk", cwd, root), /does not exist/)
  })

  it("rejects a directory", async () => {
    fs.mkdirSync(path.join(cwd, "build"))
    await expectShareError(shareFile(AGENT_ID, "build", cwd, root), /not a regular file/)
  })

  it("rejects a file over the size cap without copying it", async () => {
    const big = path.join(cwd, "huge.bin")
    fs.writeFileSync(big, "")
    fs.truncateSync(big, MAX_SHARED_FILE_BYTES + 1) // sparse, so no real disk cost
    await expectShareError(shareFile(AGENT_ID, "huge.bin", cwd, root), /The limit is 500\.0 MB/)
    expect(fs.existsSync(sharedFilesDir(AGENT_ID, root))).toBe(false)
  })
})

describe("resolveSharedFile", () => {
  it("returns the stored path and size", async () => {
    fs.writeFileSync(path.join(cwd, "a.txt"), "hello")
    const shared = await shareFile(AGENT_ID, "a.txt", cwd, root)
    const resolved = await resolveSharedFile(AGENT_ID, shared.file, root)
    expect(resolved).toEqual({ path: path.join(sharedFilesDir(AGENT_ID, root), shared.file), size: 5 })
  })

  it("throws 404 for an unknown file and 400 for traversal", async () => {
    const missing = await resolveSharedFile(AGENT_ID, "deadbeef-x.apk", root).catch((e: unknown) => e)
    expect((missing as HuxfluxApiError).status).toBe(404)
    const traversal = await resolveSharedFile(AGENT_ID, "../other/x.apk", root).catch((e: unknown) => e)
    expect((traversal as HuxfluxApiError).status).toBe(400)
  })
})

describe("removeSharedFiles", () => {
  it("deletes the agent's store and tolerates a missing one", async () => {
    fs.writeFileSync(path.join(cwd, "a.txt"), "x")
    await shareFile(AGENT_ID, "a.txt", cwd, root)
    await removeSharedFiles(AGENT_ID, root)
    expect(fs.existsSync(sharedFilesDir(AGENT_ID, root))).toBe(false)
    await expect(removeSharedFiles(AGENT_ID, root)).resolves.toBeUndefined()
  })
})

describe("parseSharedFiles", () => {
  it("decodes a valid column and drops null, empty, malformed, and wrongly shaped values", () => {
    const file = { name: "a.apk", file: "abcd1234-a.apk", size: 1 }
    expect(parseSharedFiles(JSON.stringify([file]))).toEqual([file])
    expect(parseSharedFiles(null)).toBeUndefined()
    expect(parseSharedFiles("[]")).toBeUndefined()
    expect(parseSharedFiles("{not json")).toBeUndefined()
    expect(parseSharedFiles(JSON.stringify([{ name: "a" }]))).toBeUndefined()
  })
})
