import { useState } from "react"
import { View, Text, Image, Pressable, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { attachmentUrl, isImageAttachment } from "@huxflux/shared"
import { c } from "@/theme"

function FileTile({ name, broken, size }: { name: string; broken: boolean; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", padding: 4, gap: 2 }}>
      <Ionicons name={broken ? "image-outline" : "document-outline"} size={20} color={c.fgSub} />
      <Text style={{ color: c.fgSub, fontSize: 9 }} numberOfLines={2}>{name}</Text>
    </View>
  )
}

/**
 * One attachment tile: an image thumbnail that opens full screen on tap, or a
 * file tile for other files and for images whose preview cannot load. A
 * `localUri` (the picked photo on this device) is shown before falling back
 * to the server copy.
 */
export function AttachmentImage({ file, size = 64 }: {
  file: { name: string; path: string; mimeType?: string; localUri?: string }
  size?: number
}) {
  // Keyed on the URI so a refreshed token or new server gets a fresh attempt.
  const [brokenUri, setBrokenUri] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const uri = isImageAttachment(file) ? (file.localUri ?? attachmentUrl(file.path)) : null
  const broken = !!uri && brokenUri === uri
  if (!uri || broken) return <FileTile name={file.name} broken={broken} size={size} />

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Image
          source={{ uri }}
          onError={() => setBrokenUri(uri)}
          style={{ width: size, height: size, borderRadius: 8, backgroundColor: c.card }}
        />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}>
          <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: "85%" }} />
          <Text style={{ color: "#fff", fontSize: 12, textAlign: "center", marginTop: 12 }} numberOfLines={1}>{file.name}</Text>
        </Pressable>
      </Modal>
    </>
  )
}
