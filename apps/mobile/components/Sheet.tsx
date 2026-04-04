import { Modal, View, Text, TouchableOpacity, Animated, TouchableWithoutFeedback } from "react-native"
import { useEffect, useRef } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { c } from "../theme"

export interface SheetOption {
  label: string
  onPress: () => void
  destructive?: boolean
  selected?: boolean
}

interface SheetProps {
  visible: boolean
  onClose: () => void
  title?: string
  options: SheetOption[]
}

export function Sheet({ visible, onClose, title, options }: SheetProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(500)).current

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 250,
      }).start()
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, translateY])

  if (!visible) return null

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <TouchableWithoutFeedback>
            <Animated.View style={{
              backgroundColor: c.card,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              paddingBottom: Math.max(insets.bottom, 8),
              transform: [{ translateY }],
            }}>
              {/* Drag handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>

              {title && (
                <Text style={{
                  color: c.fgSub,
                  fontSize: 12,
                  fontWeight: "600",
                  textAlign: "center",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  paddingHorizontal: 20,
                  paddingBottom: 12,
                }}>
                  {title}
                </Text>
              )}

              <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
                {options.map((opt, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { onClose(); opt.onPress() }}
                    style={{
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      borderBottomWidth: i < options.length - 1 ? 1 : 0,
                      borderBottomColor: c.border,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{
                      color: opt.destructive ? c.error : c.fg,
                      fontSize: 16,
                      fontWeight: opt.selected ? "600" : "400",
                    }}>
                      {opt.label}
                    </Text>
                    {opt.selected && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.fg }} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={{
                  marginHorizontal: 16,
                  marginTop: 10,
                  backgroundColor: c.secondary,
                  borderRadius: 14,
                  paddingVertical: 16,
                }}
              >
                <Text style={{ color: c.fg, fontSize: 16, textAlign: "center", fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}
