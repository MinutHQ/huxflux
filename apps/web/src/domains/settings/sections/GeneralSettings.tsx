import { useState } from "react"
import { Switch, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@huxflux/ui"
import { IconVolume } from "@tabler/icons-react"
import { isTauri } from "@/lib/platform"
import { SOUNDS, playSound, type SoundId } from "@/lib/sounds"
import {
  getSoundPref, setSoundPref, getSoundEnabled, setSoundEnabled,
  getSendWith, setSendWith, getAutoConvert, setAutoConvert,
  getStripYoureRight, setStripYoureRight,
  getDesktopNotif, setDesktopNotif,
  type SendWith,
} from "@/lib/notificationPrefs"
import { SettingRow } from "../components/SettingRow"
import { SettingInfo } from "../components/SettingInfo"

export function GeneralSettings() {
  const [notifications, setNotificationsState] = useState(getDesktopNotif)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  )
  const [soundEnabled, setSoundEnabledState] = useState(getSoundEnabled)
  const [autoConvertState, setAutoConvertState] = useState(getAutoConvert)
  const [stripYoureRightState, setStripYoureRightState] = useState(getStripYoureRight)
  const [sendWithState, setSendWithState] = useState<SendWith>(getSendWith)
  const [sound, setSoundState] = useState<SoundId>(getSoundPref)

  function handleSoundChange(id: SoundId) {
    setSoundState(id)
    setSoundPref(id)
  }

  function handleSoundEnabledChange(enabled: boolean) {
    setSoundEnabledState(enabled)
    setSoundEnabled(enabled)
  }

  function handleNotificationsChange(enabled: boolean) {
    setNotificationsState(enabled)
    setDesktopNotif(enabled)
    if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => setNotifPermission(perm))
    }
  }

  function handleRequestPermission() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().then((perm) => setNotifPermission(perm))
    }
  }

  return (
    <div>
      <SettingRow>
        <div>
          <SettingInfo label="Send messages with" description="Choose which key combination sends messages" />
          <div className="text-[12px] text-muted-foreground/60 mt-1">Use ⇧↵ for new lines</div>
        </div>
        <div className="shrink-0">
          <Select value={sendWithState} onValueChange={(v) => { setSendWithState(v as SendWith); setSendWith(v as SendWith) }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enter">Enter</SelectItem>
              <SelectItem value="cmd-enter">⌘ Enter</SelectItem>
              <SelectItem value="shift-enter">⇧ Enter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingRow>

      <SettingRow>
        <div>
          <SettingInfo label="Notifications" description="Get notified when an agent finishes, even in background tabs." />
          {notifPermission === "denied" && !isTauri && (
            <p className="text-[11px] text-destructive mt-1">Blocked — allow notifications in your browser settings.</p>
          )}
          {notifPermission === "unsupported" && (
            <p className="text-[11px] text-muted-foreground/60 mt-1">Not supported. On iOS, add to Home Screen first.</p>
          )}
          {notifPermission === "default" && notifications && (
            <button
              onClick={handleRequestPermission}
              className="text-[11px] text-primary mt-1 hover:underline"
            >
              Grant browser permission to enable →
            </button>
          )}
        </div>
        <Switch
          checked={notifications}
          disabled={notifPermission === "denied"}
          onCheckedChange={handleNotificationsChange}
        />
      </SettingRow>

      <SettingRow>
        <SettingInfo label="Sound effects" description="Play a sound when AI finishes working in a chat." />
        <div className="flex items-center gap-2 shrink-0">
          <Select value={sound} onValueChange={(v) => handleSoundChange(v as SoundId)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOUNDS.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => playSound(sound)}>
            <IconVolume size={13} />
            Test
          </Button>
          <Switch checked={soundEnabled} onCheckedChange={handleSoundEnabledChange} />
        </div>
      </SettingRow>

      <SettingRow>
        <SettingInfo
          label="Auto-convert long text"
          description="Convert pasted text over 5000 characters into text attachments"
        />
        <Switch checked={autoConvertState} onCheckedChange={(v) => { setAutoConvertState(v); setAutoConvert(v) }} />
      </SettingRow>

      <SettingRow>
        <SettingInfo
          label="I'm not absolutely right, thank you very much"
          description={'Strip "You\'re absolutely right!" from AI messages'}
        />
        <Switch checked={stripYoureRightState} onCheckedChange={(v) => { setStripYoureRightState(v); setStripYoureRight(v) }} />
      </SettingRow>
    </div>
  )
}
