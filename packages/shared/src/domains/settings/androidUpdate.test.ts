import { describe, expect, it } from "vitest"
import { androidApkAssetName, selectAndroidRelease, type GithubRelease } from "./androidUpdate.js"

function release(version: string, opts: { prerelease?: boolean; draft?: boolean; apk?: boolean } = {}): GithubRelease {
  const assets = [{ name: "latest.json", browser_download_url: `https://example.test/${version}/latest.json` }]
  if (opts.apk !== false) {
    assets.push({ name: androidApkAssetName(version), browser_download_url: `https://example.test/${version}/app.apk` })
  }
  return { prerelease: opts.prerelease ?? false, draft: opts.draft ?? false, assets }
}

describe("selectAndroidRelease", () => {
  const releases = [
    release("0.4.1-beta.2", { prerelease: true }),
    release("0.4.1-beta.1", { prerelease: true, apk: false }),
    release("0.4.0"),
    release("0.3.9"),
  ]

  it("takes the newest full release on stable", () => {
    expect(selectAndroidRelease(releases, "stable")).toEqual({ version: "0.4.0", url: "https://example.test/0.4.0/app.apk" })
  })

  it("takes the newest release of any kind on beta", () => {
    expect(selectAndroidRelease(releases, "beta")).toEqual({ version: "0.4.1-beta.2", url: "https://example.test/0.4.1-beta.2/app.apk" })
  })

  it("skips releases without an APK and drafts", () => {
    const list = [release("0.5.0", { draft: true }), release("0.4.2", { apk: false }), release("0.4.1")]
    expect(selectAndroidRelease(list, "stable")?.version).toBe("0.4.1")
  })

  it("returns null when no release has an APK", () => {
    expect(selectAndroidRelease([release("0.4.0", { apk: false })], "beta")).toBeNull()
    expect(selectAndroidRelease([], "stable")).toBeNull()
  })
})
