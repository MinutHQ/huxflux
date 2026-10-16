import {
  IconBolt, IconBriefcase, IconBug, IconBuilding, IconCloud, IconCode, IconCpu, IconDatabase,
  IconDeviceDesktop, IconDeviceLaptop, IconFlask, IconHome, IconRocket, IconServer, IconStar,
  IconTerminal2, type Icon,
} from "@tabler/icons-react"

// Choices for a server's switcher tile. Stored on the server as keys so the
// persisted value survives icon-library renames; unknown keys fall back.

export const SERVER_ICONS: Record<string, Icon> = {
  server: IconServer,
  laptop: IconDeviceLaptop,
  desktop: IconDeviceDesktop,
  home: IconHome,
  briefcase: IconBriefcase,
  building: IconBuilding,
  cloud: IconCloud,
  cpu: IconCpu,
  database: IconDatabase,
  terminal: IconTerminal2,
  code: IconCode,
  rocket: IconRocket,
  flask: IconFlask,
  bug: IconBug,
  bolt: IconBolt,
  star: IconStar,
}

// Full class strings so Tailwind's scanner sees every one.
export const SERVER_COLORS: Record<string, { tile: string; swatch: string }> = {
  sky: { tile: "bg-sky-500/20 text-sky-600 dark:text-sky-300", swatch: "bg-sky-400" },
  violet: { tile: "bg-violet-500/20 text-violet-600 dark:text-violet-300", swatch: "bg-violet-400" },
  rose: { tile: "bg-rose-500/20 text-rose-600 dark:text-rose-300", swatch: "bg-rose-400" },
  orange: { tile: "bg-orange-500/20 text-orange-600 dark:text-orange-300", swatch: "bg-orange-400" },
  lime: { tile: "bg-lime-500/20 text-lime-600 dark:text-lime-300", swatch: "bg-lime-400" },
  teal: { tile: "bg-teal-500/20 text-teal-600 dark:text-teal-300", swatch: "bg-teal-400" },
}

export function getServerIcon(key: string | undefined): Icon | null {
  return key ? (SERVER_ICONS[key] ?? null) : null
}

export function getServerTileClass(key: string | undefined): string | null {
  return key ? (SERVER_COLORS[key]?.tile ?? null) : null
}

/**
 * Mutation key for a server's in-flight icon generation. The generation
 * outlives the appearance editor, so the tile reads its pending state by key.
 */
export function serverIconMutationKey(serverId: string): readonly unknown[] {
  return ["server-icon", serverId]
}
