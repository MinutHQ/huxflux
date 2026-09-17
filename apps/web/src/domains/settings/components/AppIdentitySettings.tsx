import { useState } from "react"
import { Button } from "@huxflux/ui"
import { toast } from "sonner"
import { appIcons, getAppIcon, setAppIcon, type AppIconId } from "@/lib/appIcon"
import { getAppName, setAppName } from "@/lib/appName"
import { sendDesktopNotification } from "@/lib/desktopNotifications"
import { isTauri, isMacOS } from "@/lib/platform"
import { AppIconCard } from "./AppIconCard"

export function AppIdentitySettings() {
  const [appIcon, setAppIconState] = useState<AppIconId>(getAppIcon)
  const [name, setName] = useState(getAppName)
  const [isSaving, setIsSaving] = useState(false)

  async function handleIconChange(id: AppIconId) {
    setIsSaving(true)
    try {
      await setAppIcon(id)
      setAppIconState(id)
    } catch (error) {
      toast.error("Could not change app icon", { description: String(error) })
    } finally { setIsSaving(false) }
  }

  async function handleNameSave(value: string) {
    setIsSaving(true)
    try {
      await setAppName(value)
      setName(getAppName())
      toast.success("App name updated")
    } catch (error) {
      toast.error("Could not change app name", { description: String(error) })
    } finally { setIsSaving(false) }
  }

  async function handleTestNotification() {
    setIsSaving(true)
    try {
      await sendDesktopNotification("App appearance test", "Testing your selected app icon and name.")
    } catch (error) {
      toast.error("Could not send notification", { description: String(error) })
    } finally { setIsSaving(false) }
  }

  return (
    <fieldset disabled={isSaving} aria-busy={isSaving} className="py-5 border-b border-border space-y-5">
      <div>
        <label htmlFor="app-name" className="text-sm font-medium text-foreground">App name</label>
        <p className="text-[13px] text-muted-foreground mt-1 mb-3">
          Your name for this app on this device. App switchers may need restarting after a change.
        </p>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void handleNameSave(name) }}>
          <input id="app-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} placeholder="Default app name" className="max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground" />
          <Button type="submit" size="sm">Save name</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { void handleNameSave("") }}>Reset</Button>
        </form>
      </div>
      <div>
        <div className="text-sm font-medium text-foreground mb-1">App icon</div>
        <p className="text-[13px] text-muted-foreground mb-4">
          {isTauri && isMacOS ? "Changes the app icon on this Mac. Some system views may need an app restart." : "Shown as the browser tab icon"}
        </p>
        <div className="flex gap-3">
          {appIcons.map((option) => (
            <AppIconCard key={option.id} option={option} active={option.id === appIcon} onClick={() => { void handleIconChange(option.id) }} />
          ))}
        </div>
      </div>
      {isTauri && isMacOS && (
        <p className="text-[13px] text-muted-foreground">
          macOS treats each name and icon combination as a separate notification sender. You may need to allow notifications again after a change.
        </p>
      )}
      <Button type="button" size="sm" variant="outline" onClick={() => { void handleTestNotification() }}>Send test notification</Button>
    </fieldset>
  )
}
