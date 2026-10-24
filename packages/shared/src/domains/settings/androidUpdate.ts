// Android in-app updates. Release workflows attach the signed APK to each
// GitHub release as `huxflux-android-<version>.apk`; the server picks the
// newest one on its update channel and the app compares it to its own version.

const APK_ASSET_RE = /^huxflux-android-(.+)\.apk$/

export interface GithubReleaseAsset {
  name?: string
  browser_download_url?: string
}

export interface GithubRelease {
  prerelease?: boolean
  draft?: boolean
  assets?: GithubReleaseAsset[]
}

export interface AndroidRelease {
  version: string
  url: string
}

export function androidApkAssetName(version: string): string {
  return `huxflux-android-${version}.apk`
}

/**
 * The newest release with an APK on the given channel. `releases` must be
 * newest first, as GitHub lists them. Stable only takes full releases; beta
 * takes prereleases and full releases alike.
 */
export function selectAndroidRelease(releases: GithubRelease[], channel: "stable" | "beta"): AndroidRelease | null {
  for (const release of releases) {
    if (release.draft) continue
    if (channel === "stable" && release.prerelease) continue
    for (const asset of release.assets ?? []) {
      const match = asset.name?.match(APK_ASSET_RE)
      if (match?.[1] && asset.browser_download_url) {
        return { version: match[1], url: asset.browser_download_url }
      }
    }
  }
  return null
}
