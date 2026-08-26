import { useCallback } from "react"
import { Platform } from "react-native"
import { StorageAccessFramework as Saf } from "expo-file-system/legacy"
import { api, useHuxfluxMutation } from "@huxflux/shared"
import { prefs } from "@/lib/prefs"
import { useModal } from "@/ui"

// Writing into a folder the user owns goes through Android's Storage Access
// Framework. iOS has no equivalent, so the download entry stays hidden there.
export const canSaveToPhone = Platform.OS === "android"

export type DownloadKind = "file" | "diff"

export interface DownloadTarget {
  agentId: string
  path: string
  kind: DownloadKind
}

// SAF names the document it creates from the MIME type it is given: a name
// whose extension does not match that type gets the type's extension appended
// (`App.tsx` as text/plain lands as `App.tsx.txt`). Declaring the real type for
// the extensions Android knows keeps those names intact; source files fall back
// to text/plain, which reads fine everywhere even if the name picks up `.txt`.
const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  gif: "image/gif",
  html: "text/html",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  xml: "text/xml",
}

function mimeTypeFor(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
  return MIME_BY_EXTENSION[extension] ?? "text/plain"
}

export function fileNameFor(target: DownloadTarget): string {
  const base = target.path.split("/").pop() || target.path
  return target.kind === "diff" ? `${base}.diff` : base
}

function loadContent(target: DownloadTarget): Promise<string> {
  return target.kind === "diff"
    ? api.agents.diff(target.agentId, target.path)
    : api.agents.fileContent(target.agentId, target.path)
}

// Android may de-duplicate the display name (`utils.ts` → `utils (1).ts`), so
// report what actually landed rather than what we asked for.
function savedNameOf(documentUri: string, requested: string): string {
  const decoded = decodeURIComponent(documentUri)
  return decoded.slice(decoded.lastIndexOf("/") + 1) || requested
}

/** Ask for a folder the first time, then reuse it for every later download. */
async function resolveDirectory(forcePick: boolean): Promise<string | null> {
  const remembered = forcePick ? null : prefs.getDownloadDir()
  if (remembered) return remembered
  const permission = await Saf.requestDirectoryPermissionsAsync()
  if (!permission.granted) return null
  prefs.setDownloadDir(permission.directoryUri)
  return permission.directoryUri
}

/** Returns the saved file name, or `null` if the user cancelled the picker. */
async function writeToPhone(target: DownloadTarget, contents: string): Promise<string | null> {
  const fileName = fileNameFor(target)
  // Two passes: the remembered folder first, then a freshly picked one in case
  // that folder was deleted or its permission revoked since it was granted.
  for (const forcePick of [false, true]) {
    const directoryUri = await resolveDirectory(forcePick)
    if (!directoryUri) return null
    try {
      const uri = await Saf.createFileAsync(directoryUri, fileName, mimeTypeFor(fileName))
      await Saf.writeAsStringAsync(uri, contents, { encoding: "utf8" })
      return savedNameOf(uri, fileName)
    } catch (err) {
      if (forcePick) throw err
      prefs.clearDownloadDir()
    }
  }
  return null
}

/**
 * Saves a worktree file (or its diff) into a folder on the phone. The first
 * download opens Android's folder picker; the choice is remembered afterwards.
 */
export function useFileDownload() {
  const modal = useModal()

  const download = useHuxfluxMutation<string | null, DownloadTarget>({
    mutationFn: (target) => loadContent(target).then((contents) => writeToPhone(target, contents)),
    onSuccess: (savedName) => {
      if (savedName) modal.showAlert("Saved", `${savedName} was saved to your phone.`)
    },
    onError: (error) => {
      modal.showAlert("Download failed", error.message)
    },
  })

  const saveToPhone = useCallback(
    (target: DownloadTarget) => download.mutate(target),
    [download],
  )

  return { saveToPhone, isSaving: download.isPending }
}
