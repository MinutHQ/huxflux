import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { getTheme, setTheme as applyThemeSetting, type Theme } from "@/lib/theme"
import { colorThemes, getColorTheme, getLightColorTheme, setColorTheme } from "@/lib/colorThemes"
import { getDiffViewMode, setDiffViewMode, type DiffViewMode } from "@/lib/diffPrefs"
import { SettingRow } from "../components/SettingRow"
import { SettingInfo } from "../components/SettingInfo"
import { ThemeCard } from "../components/ThemeCard"

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [activeColorTheme, setActiveColorTheme] = useState(getColorTheme)
  const [activeLightColorTheme, setActiveLightColorTheme] = useState(getLightColorTheme)
  const [diffViewMode, setDiffViewModeState] = useState(() => getDiffViewMode())

  const isLight =
    theme === "light" ||
    (theme === "system" && typeof window !== "undefined" && !window.matchMedia("(prefers-color-scheme: dark)").matches)

  function handleThemeChange(value: Theme) {
    setTheme(value)
    applyThemeSetting(value)
  }

  function handleColorThemeChange(id: string) {
    const ct = colorThemes.find((t) => t.id === id)
    if (ct?.light) {
      setActiveLightColorTheme(id)
    } else {
      setActiveColorTheme(id)
    }
    setColorTheme(id)
  }

  const visibleThemes = colorThemes.filter((ct) => !!ct.light === isLight)
  const currentActive = isLight ? activeLightColorTheme : activeColorTheme

  return (
    <div>
      <SettingRow>
        <SettingInfo label="Mode" description="Choose light, dark, or match your system" />
        <Select value={theme} onValueChange={handleThemeChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <div className="py-5">
        <div className="text-sm font-medium text-foreground mb-1">Color theme</div>
        <div className="text-[13px] text-muted-foreground mb-4 leading-snug">
          {isLight ? "Pick a color palette for light mode" : "Pick a color palette for dark mode"}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {visibleThemes.map((ct) => (
            <ThemeCard
              key={ct.id}
              theme={ct}
              active={ct.id === currentActive}
              onClick={() => handleColorThemeChange(ct.id)}
            />
          ))}
        </div>
      </div>

      <SettingRow>
        <SettingInfo label="Diff view mode" description="How file changes are displayed in the workspace" />
        <Select value={diffViewMode} onValueChange={(v: DiffViewMode) => { setDiffViewModeState(v); setDiffViewMode(v) }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tree">File tree</SelectItem>
            <SelectItem value="stacked">Stacked diffs</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}
