import { afterEach, beforeEach, describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { HuxfluxApiError, MAX_ATTACHMENT_BYTES } from "@huxflux/shared"
import { UPLOAD_BODY_LIMIT, attachmentsDir, resolveAttachment, saveAttachment } from "./attachments.js"

const AGENT_ID = "agent-att-1"
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hux-att-"))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

async function expectApiError(p: Promise<unknown>, status: number, code: string): Promise<void> {
  const err = await p.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(HuxfluxApiError)
  expect((err as HuxfluxApiError).status).toBe(status)
  expect((err as HuxfluxApiError).code).toBe(code)
}

describe("saveAttachment", () => {
  it("decodes a data URL and writes it under the agent's dir", async () => {
    const saved = await saveAttachment(AGENT_ID, {
      name: "shot.png", mimeType: "image/png", data: `data:image/png;base64,${PNG_BYTES.toString("base64")}`,
    }, root)
    expect(saved.name).toBe("shot.png")
    expect(saved.mimeType).toBe("image/png")
    expect(path.dirname(saved.path)).toBe(attachmentsDir(AGENT_ID, root))
    expect(path.basename(saved.path)).toMatch(/^[0-9a-f]{8}-shot\.png$/)
    expect(fs.readFileSync(saved.path)).toEqual(PNG_BYTES)
  })

  it("keeps two uploads with the same name apart", async () => {
    const body = { name: "image.png", mimeType: "image/png", data: PNG_BYTES.toString("base64") }
    const a = await saveAttachment(AGENT_ID, body, root)
    const b = await saveAttachment(AGENT_ID, body, root)
    expect(a.path).not.toBe(b.path)
    expect(fs.existsSync(a.path)).toBe(true)
    expect(fs.existsSync(b.path)).toBe(true)
  })

  it("sanitises unsafe characters in the name", async () => {
    const saved = await saveAttachment(AGENT_ID, { name: "my photo (1).jpg", mimeType: "image/jpeg", data: PNG_BYTES.toString("base64") }, root)
    expect(saved.name).toBe("my_photo__1_.jpg")
  })

  it("neutralises traversal names and rejects bare dot names", async () => {
    const saved = await saveAttachment(AGENT_ID, { name: "../x.png", mimeType: "image/png", data: "AA==" }, root)
    expect(path.dirname(saved.path)).toBe(attachmentsDir(AGENT_ID, root))
    expect(saved.name).toBe(".._x.png")
    await expectApiError(saveAttachment(AGENT_ID, { name: "..", mimeType: "image/png", data: "AA==" }, root), 400, "attachment.invalid_name")
  })

  it("accepts names with double dots inside", async () => {
    const saved = await saveAttachment(AGENT_ID, { name: "Screenshot 2024..png", mimeType: "image/png", data: "AA==" }, root)
    expect(saved.name).toBe("Screenshot_2024..png")
  })

  it("rejects empty files", async () => {
    await expectApiError(saveAttachment(AGENT_ID, { name: "a.png", mimeType: "image/png", data: "data:image/png;base64," }, root), 400, "attachment.empty")
  })

  it("rejects files over the cap with 413", async () => {
    const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64")
    await expectApiError(saveAttachment(AGENT_ID, { name: "big.png", mimeType: "image/png", data: big }, root), 413, "attachment.too_large")
  })

  it("sets a body limit that fits a full-size file as base64", () => {
    const encodedMax = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4
    expect(UPLOAD_BODY_LIMIT).toBeGreaterThan(encodedMax)
  })
})

describe("resolveAttachment", () => {
  it("returns the stored file with a mime type from its extension", async () => {
    const saved = await saveAttachment(AGENT_ID, { name: "shot.PNG", mimeType: "image/png", data: PNG_BYTES.toString("base64") }, root)
    const found = await resolveAttachment(AGENT_ID, path.basename(saved.path), root)
    expect(found).toEqual({ path: saved.path, mimeType: "image/png" })
  })

  it("404s on a missing file", async () => {
    await expectApiError(resolveAttachment(AGENT_ID, "nope.png", root), 404, "attachment.not_found")
  })

  it("refuses names or agent ids that leave the attachments dir", async () => {
    await expectApiError(resolveAttachment(AGENT_ID, "../other/x.png", root), 400, "attachment.invalid_name")
    await expectApiError(resolveAttachment("..", "x.png", root), 400, "attachment.invalid_name")
  })
})
