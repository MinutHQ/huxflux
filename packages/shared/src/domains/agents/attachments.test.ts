import { describe, it, expect, beforeEach } from "vitest"
import {
  buildAttachedFilesBlock, parseAttachedFiles, isImageAttachment, attachmentUrl,
  checkAttachmentSize, describeUploadError, MAX_ATTACHMENT_BYTES,
} from "./attachments.js"
import { addServer, setActiveServerId } from "../servers/servers.store.js"
import { configureStorage } from "../../storage.js"
import { HuxfluxApiError } from "../../error.js"

const PNG = { name: "shot.png", path: "/tmp/huxflux-attachments/agent-1/ab12cd34-shot.png" }
const PDF = { name: "spec.pdf", path: "/tmp/huxflux-attachments/agent-1/ff00ff00-spec.pdf" }

describe("buildAttachedFilesBlock / parseAttachedFiles", () => {
  it("returns the text unchanged when there are no files", () => {
    expect(buildAttachedFilesBlock("hello", [])).toBe("hello")
    expect(parseAttachedFiles("hello")).toEqual({ files: [], text: "hello" })
  })

  it("round-trips files and text", () => {
    const content = buildAttachedFilesBlock("look at this", [PNG, PDF])
    expect(content).toBe(`Attached files:\n- shot.png: ${PNG.path}\n- spec.pdf: ${PDF.path}\n\n---\n\nlook at this`)
    expect(parseAttachedFiles(content)).toEqual({ files: [PNG, PDF], text: "look at this" })
  })

  it("parses an attachment-only message after the server trims the trailing separator", () => {
    const stored = buildAttachedFilesBlock("", [PNG]).trim()
    expect(parseAttachedFiles(stored)).toEqual({ files: [PNG], text: "" })
  })

  it("leaves text that only mentions the header alone", () => {
    const content = "Attached files: none today"
    expect(parseAttachedFiles(content)).toEqual({ files: [], text: content })
  })
})

describe("isImageAttachment", () => {
  it("prefers the mime type when present", () => {
    expect(isImageAttachment({ name: "x.bin", mimeType: "image/png" })).toBe(true)
    expect(isImageAttachment({ name: "x.png", mimeType: "application/pdf" })).toBe(false)
  })

  it("falls back to the extension", () => {
    expect(isImageAttachment(PNG)).toBe(true)
    expect(isImageAttachment({ name: "IMG_1.JPEG" })).toBe(true)
    expect(isImageAttachment(PDF)).toBe(false)
  })
})

describe("attachmentUrl", () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    configureStorage({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => { mem.set(k, v) },
      removeItem: (k) => { mem.delete(k) },
    })
  })

  it("builds an authed URL from the upload path", () => {
    const server = addServer({ name: "lan", url: "http://192.168.1.5:4321", token: "tok" })
    setActiveServerId(server.id)
    expect(attachmentUrl(PNG.path)).toBe("http://192.168.1.5:4321/api/agents/agent-1/attachments/ab12cd34-shot.png?token=tok")
  })

  it("returns null for paths the upload route did not write", () => {
    const server = addServer({ name: "lan", url: "http://192.168.1.5:4321", token: "tok" })
    setActiveServerId(server.id)
    expect(attachmentUrl("/Users/me/repo/src/app.ts")).toBeNull()
  })

  it("returns null without an active server", () => {
    expect(attachmentUrl(PNG.path)).toBeNull()
  })
})

describe("checkAttachmentSize", () => {
  it("accepts files up to the cap", () => {
    expect(checkAttachmentSize("a.png", MAX_ATTACHMENT_BYTES)).toBeNull()
  })

  it("rejects empty and oversized files with a readable reason", () => {
    expect(checkAttachmentSize("a.png", 0)).toBe("a.png is empty.")
    expect(checkAttachmentSize("a.png", MAX_ATTACHMENT_BYTES + 1)).toBe("a.png is 50.0 MB. The limit is 50.0 MB.")
  })
})

describe("describeUploadError", () => {
  it("explains a 413 with the limit", () => {
    expect(describeUploadError("a.png", new HuxfluxApiError(413, "request.bad", "Request body is too large")))
      .toBe("a.png is too large. The limit is 50.0 MB.")
  })

  it("explains timeouts and unreachable servers", () => {
    const abort = new Error("aborted")
    abort.name = "AbortError"
    expect(describeUploadError("a.png", abort)).toBe("Uploading a.png timed out. Check the connection and try again.")
    expect(describeUploadError("a.png", new TypeError("Network request failed")))
      .toBe("Could not upload a.png: the server is unreachable.")
  })

  it("passes other server messages through", () => {
    expect(describeUploadError("a.png", new HuxfluxApiError(400, "attachment.empty", "a.png is empty")))
      .toBe("Could not upload a.png: a.png is empty")
  })
})
