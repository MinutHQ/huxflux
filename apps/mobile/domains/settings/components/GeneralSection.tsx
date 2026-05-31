import { View } from "react-native"
import { useState } from "react"
import { c } from "@/theme"
import { prefs } from "@/lib/prefs"
import { SectionLabel, SettingRow, SettingRowNoBorder } from "./SettingsRow"

export function GeneralSection() {
  const [stripYoureRight, setStripYoureRight] = useState(() => prefs.getStripYoureRight())
  const [alwaysContext, setAlwaysContext] = useState(() => prefs.getAlwaysContext())
  const [autoConvert, setAutoConvert] = useState(() => prefs.getAutoConvert())

  return (
    <View>
      <SectionLabel label="General" />
      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
        <SettingRow
          label="Auto-convert long text"
          description="Convert pasted text over 5000 characters into text attachments"
          value={autoConvert}
          onValueChange={(v) => { setAutoConvert(v); prefs.setAutoConvert(v) }}
        />
        <SettingRow
          label="I'm not absolutely right, thank you very much"
          description={'Strip "You\'re absolutely right!" from AI messages'}
          value={stripYoureRight}
          onValueChange={(v) => { setStripYoureRight(v); prefs.setStripYoureRight(v) }}
        />
        <SettingRowNoBorder
          label="Always show context usage"
          description="Always show context percent used. By default shown only when >70% used."
          value={alwaysContext}
          onValueChange={(v) => { setAlwaysContext(v); prefs.setAlwaysContext(v) }}
        />
      </View>
    </View>
  )
}

export function GitSection() {
  const [gitAutoPush, setGitAutoPush] = useState(() => prefs.getGitAutoPush())
  const [gitDeleteBranch, setGitDeleteBranch] = useState(() => prefs.getGitDeleteBranch())
  const [gitArchiveOnMerge, setGitArchiveOnMerge] = useState(() => prefs.getGitArchiveOnMerge())

  return (
    <View>
      <SectionLabel label="Git" />
      <View style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14 }}>
        <SettingRow
          label="Auto-push after commit"
          description="Automatically push to remote after each commit"
          value={gitAutoPush}
          onValueChange={(v) => { setGitAutoPush(v); prefs.setGitAutoPush(v) }}
        />
        <SettingRow
          label="Delete branch on archive"
          description="Delete the git branch when an agent is archived"
          value={gitDeleteBranch}
          onValueChange={(v) => { setGitDeleteBranch(v); prefs.setGitDeleteBranch(v) }}
        />
        <SettingRowNoBorder
          label="Archive on merge"
          description="Automatically archive agents when their PR is merged"
          value={gitArchiveOnMerge}
          onValueChange={(v) => { setGitArchiveOnMerge(v); prefs.setGitArchiveOnMerge(v) }}
        />
      </View>
    </View>
  )
}
