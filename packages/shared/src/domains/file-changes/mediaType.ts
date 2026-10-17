// Which worktree files the browser can preview as media, keyed by extension.
// Shared by the server (Content-Type of the raw-file route) and the web viewer
// (which component to mount). SVG is left out on purpose: it is text the code
// editor can show and edit, and served raw it could run script.

export type MediaKind = "image" | "video" | "audio"

export interface MediaType {
  kind: MediaKind
  mime: string
}

const mediaTypes: Record<string, MediaType> = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  gif: { kind: "image", mime: "image/gif" },
  webp: { kind: "image", mime: "image/webp" },
  avif: { kind: "image", mime: "image/avif" },
  bmp: { kind: "image", mime: "image/bmp" },
  ico: { kind: "image", mime: "image/x-icon" },
  mp4: { kind: "video", mime: "video/mp4" },
  m4v: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  webm: { kind: "video", mime: "video/webm" },
  ogv: { kind: "video", mime: "video/ogg" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  wav: { kind: "audio", mime: "audio/wav" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  oga: { kind: "audio", mime: "audio/ogg" },
  opus: { kind: "audio", mime: "audio/opus" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  aac: { kind: "audio", mime: "audio/aac" },
  flac: { kind: "audio", mime: "audio/flac" },
}

/** Media type for a path by its extension (case-insensitive), or null when it is not previewable media. */
export function getMediaType(path: string): MediaType | null {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return null
  return mediaTypes[name.slice(dot + 1).toLowerCase()] ?? null
}
