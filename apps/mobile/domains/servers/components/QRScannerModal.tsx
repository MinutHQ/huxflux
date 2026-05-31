import { Modal, View, Text, TouchableOpacity } from "react-native"
import { CameraView } from "expo-camera"
import { Ionicons } from "@expo/vector-icons"

export function QRScannerModal({
  visible, scanned, onClose, onScan,
}: {
  visible: boolean
  scanned: boolean
  onClose: () => void
  onScan: (data: { data: string }) => void
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : onScan}
        />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <View style={{ width: 220, height: 220, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)" }} />
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 16, textAlign: "center" }}>Point at server QR code</Text>
        </View>
        <View style={{ position: "absolute", top: 56, right: 20 }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
