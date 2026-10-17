import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import type { Readable } from "node:stream"
import { createGitTmpRepo, type GitTmpRepo } from "../../../test/harness.js"
import { PathOutsideWorktreeError } from "./files.js"
import { contentDisposition, openRawWorktreeFile, parseRange } from "./rawFile.js"

async function readAll(stream: Readable | null): Promise<string> {
  if (!stream) throw new Error("expected a stream")
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}

describe("parseRange", () => {
  it("returns null without a usable header", () => {
    expect(parseRange(undefined, 100)).toBeNull()
    expect(parseRange("bytes=-", 100)).toBeNull()
    expect(parseRange("items=0-1", 100)).toBeNull()
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull()
    expect(parseRange("bytes=9-3", 100)).toBeNull()
  })

  it("parses closed, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 })
  })

  it("clamps an end past the file and a suffix longer than the file", () => {
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 })
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 })
  })

  it("flags ranges that start past the end", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable")
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable")
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable")
  })
})

describe("openRawWorktreeFile", () => {
  let repo: GitTmpRepo
  let outside: string

  beforeEach(() => {
    repo = createGitTmpRepo()
    outside = mkdtempSync(path.join(tmpdir(), "huxflux-outside-"))
    writeFileSync(path.join(outside, "secret.txt"), "top secret")
    mkdirSync(path.join(repo.path, "media"))
    writeFileSync(path.join(repo.path, "media/clip.mp4"), "0123456789")
    writeFileSync(path.join(repo.path, "data.bin"), "abc")
  })

  afterEach(() => {
    repo.cleanup()
    rmSync(outside, { recursive: true, force: true })
  })

  it("streams the whole file with the media MIME type", async () => {
    const file = await openRawWorktreeFile(repo.path, "media/clip.mp4")
    expect(file.size).toBe(10)
    expect(file.range).toBeNull()
    expect(file.contentType).toBe("video/mp4")
    expect(await readAll(file.stream)).toBe("0123456789")
  })

  it("streams only the requested range", async () => {
    const file = await openRawWorktreeFile(repo.path, "media/clip.mp4", "bytes=2-4")
    expect(file.range).toEqual({ start: 2, end: 4 })
    expect(await readAll(file.stream)).toBe("234")
  })

  it("opens no stream for an unsatisfiable range", async () => {
    const file = await openRawWorktreeFile(repo.path, "media/clip.mp4", "bytes=50-")
    expect(file.range).toBe("unsatisfiable")
    expect(file.stream).toBeNull()
  })

  it("serves non-media files as octet-stream", async () => {
    const file = await openRawWorktreeFile(repo.path, "data.bin")
    expect(file.contentType).toBe("application/octet-stream")
    expect(await readAll(file.stream)).toBe("abc")
  })

  it("refuses paths and symlinks that leave the worktree", async () => {
    await expect(openRawWorktreeFile(repo.path, "../secret.txt")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
    symlinkSync(path.join(outside, "secret.txt"), path.join(repo.path, "leak.txt"))
    await expect(openRawWorktreeFile(repo.path, "leak.txt")).rejects.toBeInstanceOf(PathOutsideWorktreeError)
  })

  it("treats a directory as not found", async () => {
    await expect(openRawWorktreeFile(repo.path, "media")).rejects.toMatchObject({ code: "ENOENT" })
  })
})

describe("contentDisposition", () => {
  it("uses the file name with an ASCII fallback and a UTF-8 name", () => {
    expect(contentDisposition("attachment", "media/clip.mp4")).toBe(`attachment; filename="clip.mp4"; filename*=UTF-8''clip.mp4`)
    expect(contentDisposition("inline", "a/bild ö \"x\".png")).toBe(`inline; filename="bild _ _x_.png"; filename*=UTF-8''bild%20%C3%B6%20%22x%22.png`)
    expect(contentDisposition("attachment", "it's (1).png")).toBe(`attachment; filename="it's (1).png"; filename*=UTF-8''it%27s%20%281%29.png`)
  })
})
