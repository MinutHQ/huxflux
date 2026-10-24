import { Alert, Linking, Text, TouchableOpacity, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { formatBytes, sharedFileUrl, type SharedFile } from "@huxflux/shared"
import { c } from "@/theme"

/**
 * Download buttons for files an agent shared. Opens the URL in the system
 * browser, which saves it (and on Android offers to install an APK).
 */
export function SharedFileChips({ agentId, files }: { agentId: string; files: SharedFile[] }) {
  const handlePress = (file: SharedFile) => {
    const url = sharedFileUrl(agentId, file.file)
    if (!url) { Alert.alert("No server connected"); return }
    Linking.openURL(url).catch((err: unknown) => Alert.alert("Could not open download", String(err)))
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {files.map((f) => (
        <TouchableOpacity
          key={f.file}
          onPress={() => handlePress(f)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8,
            borderRadius: 10, backgroundColor: c.secondary, borderWidth: 1, borderColor: c.border,
          }}
        >
          <Ionicons name="download-outline" size={15} color={c.fgSub} />
          <Text style={{ color: c.fg, fontSize: 13, fontWeight: "500", maxWidth: 200 }} numberOfLines={1}>{f.name}</Text>
          <Text style={{ color: c.fgSub, fontSize: 12 }}>{formatBytes(f.size)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
