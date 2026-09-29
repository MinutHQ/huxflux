import { describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { dropGithubPackagesPin, withoutGithubPackagesPin } from "./npmRegistry.js"

describe("withoutGithubPackagesPin", () => {
  it("removes the pin and keeps every other line", () => {
    const content = [
      "//npm.pkg.github.com/:_authToken=ghp_secret",
      "@minuthq:registry=https://npm.pkg.github.com/",
      "fund=false",
      "",
    ].join("\n")

    expect(withoutGithubPackagesPin(content)).toBe(
      ["//npm.pkg.github.com/:_authToken=ghp_secret", "fund=false", ""].join("\n"),
    )
  })

  it("matches the pin with surrounding whitespace and no trailing slash", () => {
    const content = "  @minuthq:registry = https://npm.pkg.github.com  \nfund=false\n"
    expect(withoutGithubPackagesPin(content)).toBe("fund=false\n")
  })

  it("removes every occurrence when the pin was appended more than once", () => {
    const content = [
      "@minuthq:registry=https://npm.pkg.github.com",
      "fund=false",
      "@minuthq:registry=https://npm.pkg.github.com/",
      "",
    ].join("\n")

    expect(withoutGithubPackagesPin(content)).toBe(["fund=false", ""].join("\n"))
  })

  it("removes a pin that is the last line with no trailing newline", () => {
    expect(withoutGithubPackagesPin("fund=false\n@minuthq:registry=https://npm.pkg.github.com")).toBe("fund=false")
  })

  it("removes a pin from a file with CRLF line endings, preserving the rest", () => {
    const content = "fund=false\r\n@minuthq:registry=https://npm.pkg.github.com/\r\nignore-scripts=true\r\n"
    expect(withoutGithubPackagesPin(content)).toBe("fund=false\r\nignore-scripts=true\r\n")
  })

  it("removes a pin whose value is quoted", () => {
    const content = '@minuthq:registry="https://npm.pkg.github.com/"\nfund=false\n'
    expect(withoutGithubPackagesPin(content)).toBe("fund=false\n")
  })

  it("returns null when there is no pin to remove", () => {
    expect(withoutGithubPackagesPin("fund=false\nignore-scripts=true\n")).toBeNull()
    expect(withoutGithubPackagesPin("")).toBeNull()
  })

  it("leaves a pin to another registry alone", () => {
    const content = "@minuthq:registry=https://npm.internal.example.com\n"
    expect(withoutGithubPackagesPin(content)).toBeNull()
  })

  it("leaves another scope's GitHub Packages pin alone", () => {
    const content = "@other:registry=https://npm.pkg.github.com\n"
    expect(withoutGithubPackagesPin(content)).toBeNull()
  })

  it("ignores lines that are not key=value", () => {
    const content = "; @minuthq:registry=https://npm.pkg.github.com\n"
    expect(withoutGithubPackagesPin(content)).toBeNull()
  })
})

describe("dropGithubPackagesPin", () => {
  function tmpNpmrc(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "huxflux-npmrc-"))
    const file = path.join(dir, ".npmrc")
    fs.writeFileSync(file, content)
    return file
  }

  it("rewrites the file when a pin is present", () => {
    const file = tmpNpmrc("@minuthq:registry=https://npm.pkg.github.com\nfund=false\n")
    dropGithubPackagesPin(file)
    expect(fs.readFileSync(file, "utf8")).toBe("fund=false\n")
  })

  it("leaves the file byte-identical when there is no pin", () => {
    const file = tmpNpmrc("fund=false\n")
    const before = fs.statSync(file).mtimeMs
    dropGithubPackagesPin(file)
    expect(fs.readFileSync(file, "utf8")).toBe("fund=false\n")
    expect(fs.statSync(file).mtimeMs).toBe(before)
  })

  it("does not create the file when it does not exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "huxflux-npmrc-"))
    const file = path.join(dir, ".npmrc")
    dropGithubPackagesPin(file)
    expect(fs.existsSync(file)).toBe(false)
  })
})
