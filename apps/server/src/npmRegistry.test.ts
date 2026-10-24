import { describe, expect, it } from "vitest"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { dropGithubPackagesPin, isNewerVersion, npmEnv, withoutGithubPackagesPin } from "./npmRegistry.js"

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

describe("npmEnv", () => {
  it("puts the running Node's bin dir first on PATH", () => {
    const env = npmEnv({ PATH: "/usr/bin:/bin", HOME: "/home/me" })
    expect(env.PATH).toBe([path.dirname(process.execPath), "/usr/bin:/bin"].join(path.delimiter))
    expect(env.HOME).toBe("/home/me")
  })

  it("keeps the existing casing of the PATH key", () => {
    const env = npmEnv({ Path: "C:\\Windows" })
    expect(env.Path).toBe([path.dirname(process.execPath), "C:\\Windows"].join(path.delimiter))
    expect(env.PATH).toBeUndefined()
  })

  it("sets PATH when there is none", () => {
    expect(npmEnv({}).PATH).toBe(path.dirname(process.execPath))
  })
})

describe("isNewerVersion", () => {
  it("compares major, minor and patch numerically", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true)
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true)
    expect(isNewerVersion("0.3.6", "0.3.10")).toBe(false)
  })

  it("is false for equal versions", () => {
    expect(isNewerVersion("0.3.5", "0.3.5")).toBe(false)
    expect(isNewerVersion("0.3.5-beta.2", "0.3.5-beta.2")).toBe(false)
  })

  it("ranks a release above its prereleases", () => {
    expect(isNewerVersion("0.3.5", "0.3.5-beta.4")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.4", "0.3.5")).toBe(false)
  })

  it("compares numeric prerelease parts numerically", () => {
    expect(isNewerVersion("0.3.5-beta.10", "0.3.5-beta.9")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.9", "0.3.5-beta.10")).toBe(false)
  })

  it("handles prerelease tags other than beta", () => {
    expect(isNewerVersion("0.3.5-rc.1", "0.3.5-beta.3")).toBe(true)
    expect(isNewerVersion("0.3.5-beta.3.1", "0.3.5-beta.3")).toBe(true)
    expect(isNewerVersion("0.3.6-alpha", "0.3.5")).toBe(true)
  })

  it("ignores a leading v and build metadata", () => {
    expect(isNewerVersion("v0.3.6", "0.3.5")).toBe(true)
    expect(isNewerVersion("0.3.5+build.7", "0.3.5")).toBe(false)
  })

  it("never treats unparseable input as newer", () => {
    expect(isNewerVersion("", "0.3.5")).toBe(false)
    expect(isNewerVersion("latest", "0.3.5")).toBe(false)
    expect(isNewerVersion("0.3.6", "garbage")).toBe(false)
  })
})
