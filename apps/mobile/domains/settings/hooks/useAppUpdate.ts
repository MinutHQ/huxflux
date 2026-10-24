import { useCallback, useMemo, useState } from "react"
import { Platform } from "react-native"
import Constants from "expo-constants"
import { api, isNewerVersion, queryKeys, useHuxfluxQuery } from "@huxflux/shared"
import { downloadAndInstallApk } from "../service/installApk"

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface AvailableAppUpdate {
  version: string
  url: string
}

export interface AppUpdateState {
  /** Version of the running app. */
  current: string
  /** Newer APK on the server's update channel, or null (always null off Android). */
  available: AvailableAppUpdate | null
  /** Download progress 0..1 while installing, otherwise null. */
  progress: number | null
  error: string | null
  install: () => void
}

/** In-app updates for the sideloaded Android app. */
export function useAppUpdate(): AppUpdateState {
  const enabled = Platform.OS === "android"
  const current = Constants.expoConfig?.version ?? "0.0.0"
  const { data } = useHuxfluxQuery({
    queryKey: queryKeys.settings.androidUpdate(),
    queryFn: () => api.settings.androidUpdate(),
    enabled,
    staleTime: CHECK_INTERVAL_MS,
    refetchInterval: CHECK_INTERVAL_MS,
  })
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const latestVersion = data?.version ?? null
  const latestUrl = data?.url ?? null
  const available = useMemo(
    () => enabled && latestVersion && latestUrl && isNewerVersion(latestVersion, current)
      ? { version: latestVersion, url: latestUrl }
      : null,
    [enabled, latestVersion, latestUrl, current],
  )

  const install = useCallback(() => {
    if (!available || progress !== null) return
    setError(null)
    setProgress(0)
    downloadAndInstallApk(available.url, available.version, setProgress)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setProgress(null))
  }, [available, progress])

  return { current, available, progress, error, install }
}
