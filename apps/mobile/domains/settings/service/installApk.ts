import * as FileSystem from "expo-file-system/legacy"
import * as IntentLauncher from "expo-intent-launcher"

const APK_MIME_TYPE = "application/vnd.android.package-archive"
// Intent.FLAG_GRANT_READ_URI_PERMISSION: lets the system installer read our file.
const FLAG_GRANT_READ_URI_PERMISSION = 1

/**
 * Download an APK into the app cache and hand it to Android's package
 * installer. The first time, Android asks the user to allow Huxflux to install
 * apps. Resolves once the installer screen closes.
 */
export async function downloadAndInstallApk(url: string, version: string, onProgress: (fraction: number) => void): Promise<void> {
  const target = `${FileSystem.cacheDirectory}huxflux-android-${version}.apk`
  const download = FileSystem.createDownloadResumable(url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite)
  })
  const result = await download.downloadAsync()
  if (!result || result.status !== 200) {
    throw new Error(`Download failed (HTTP ${result?.status ?? "no response"})`)
  }
  const contentUri = await FileSystem.getContentUriAsync(result.uri)
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME_TYPE,
  })
}
