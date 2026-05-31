import { useEffect, useState } from "react"
import { Switch } from "@huxflux/ui"
import { api } from "@huxflux/shared"
import { SettingRow } from "../components/SettingRow"
import { SettingInfo } from "../components/SettingInfo"

export function GitSettings() {
  const [killOnDone, setKillOnDone] = useState(false)
  const [prCommentMonitoring, setPrCommentMonitoring] = useState(true)
  const [ciMonitoring, setCiMonitoring] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.settings.current().then((s) => {
      setKillOnDone(s.killProcessesOnDone ?? false)
      setPrCommentMonitoring(s.prCommentMonitoring ?? true)
      setCiMonitoring(s.ciMonitoring ?? true)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  return (
    <div>
      <SettingRow>
        <SettingInfo label="Kill processes on done" description="Automatically stop dev servers and processes when agent is marked done or cancelled" />
        <Switch disabled={!loaded} checked={killOnDone} onCheckedChange={(v) => { setKillOnDone(v); api.settings.update({ killProcessesOnDone: v }) }} />
      </SettingRow>
      <SettingRow>
        <SettingInfo label="PR comment monitoring" description="Send new PR review comments to agents automatically" />
        <Switch disabled={!loaded} checked={prCommentMonitoring} onCheckedChange={(v) => { setPrCommentMonitoring(v); api.settings.update({ prCommentMonitoring: v }) }} />
      </SettingRow>
      <SettingRow>
        <SettingInfo label="CI monitoring" description="Notify agents when CI checks fail on their PR" />
        <Switch disabled={!loaded} checked={ciMonitoring} onCheckedChange={(v) => { setCiMonitoring(v); api.settings.update({ ciMonitoring: v }) }} />
      </SettingRow>
    </div>
  )
}
