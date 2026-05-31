import * as TablerIcons from "@tabler/icons-react"
import type React from "react"

// Curated icon set for the repo icon picker. Grouped for nicer browsing.
export const ICON_CATEGORIES = [
  { label: "Dev", icons: ["IconCode", "IconBrandGithub", "IconBrandGit", "IconTerminal", "IconApi", "IconDatabase", "IconServer", "IconBug", "IconTestPipe", "IconBraces", "IconJson"] },
  { label: "Cloud", icons: ["IconCloud", "IconCloudUpload", "IconContainer", "IconBrandDocker", "IconServerBolt", "IconNetwork"] },
  { label: "Data", icons: ["IconChartBar", "IconTable", "IconChartLine", "IconReport", "IconDashboard", "IconChartPie"] },
  { label: "UI", icons: ["IconLayout", "IconComponents", "IconPalette", "IconBrush", "IconPhoto", "IconDeviceDesktop"] },
  { label: "Misc", icons: ["IconBrain", "IconRocket", "IconStar", "IconHeart", "IconBolt", "IconKey", "IconShield", "IconGlobe", "IconMail", "IconHome", "IconBook", "IconCamera", "IconMic", "IconPackage", "IconBox", "IconCoin", "IconLeaf", "IconPaw", "IconFlask", "IconSparkles"] },
]

export function getTablerIcon(name: string): React.ComponentType<{ size?: number }> | undefined {
  const icons = TablerIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>
  return icons[name]
}

// Repo accent colors. Hash-stable across renders.
const repoColors = [
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-teal-500/20 text-teal-400 border-teal-500/30",
]

export function repoColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % repoColors.length
  return repoColors[hash]
}
