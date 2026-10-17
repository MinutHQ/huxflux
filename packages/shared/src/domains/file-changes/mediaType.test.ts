import { describe, expect, it } from "vitest"
import { getMediaType } from "./mediaType.js"

describe("getMediaType", () => {
  it("maps image, video and audio extensions", () => {
    expect(getMediaType("assets/logo.png")).toEqual({ kind: "image", mime: "image/png" })
    expect(getMediaType("clips/demo.mov")).toEqual({ kind: "video", mime: "video/quicktime" })
    expect(getMediaType("sounds/ding.mp3")).toEqual({ kind: "audio", mime: "audio/mpeg" })
  })

  it("ignores extension case", () => {
    expect(getMediaType("PHOTO.JPG")).toEqual({ kind: "image", mime: "image/jpeg" })
  })

  it("returns null for non-media, svg, dotfiles and extensionless names", () => {
    expect(getMediaType("src/index.ts")).toBeNull()
    expect(getMediaType("icon.svg")).toBeNull()
    expect(getMediaType(".png")).toBeNull()
    expect(getMediaType("Makefile")).toBeNull()
  })

  it("reads the extension from the file name, not a dotted folder", () => {
    expect(getMediaType("v1.png/README")).toBeNull()
  })
})
