import { View, Text, TouchableOpacity, Modal, TextInput, Pressable, Platform, ScrollView, KeyboardAvoidingView } from "react-native"
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react"
import { c } from "../theme"

// ── Types ────────────────────────────────────────────────────────────────────

interface ActionSheetOption {
  label: string
  onPress: () => void
  destructive?: boolean
  icon?: string
}

type ModalState =
  | { type: "none" }
  | { type: "action-sheet"; title?: string; options: ActionSheetOption[] }
  | { type: "confirm"; title: string; message?: string; confirmLabel?: string; confirmDestructive?: boolean; onConfirm: () => void }
  | { type: "prompt"; title: string; placeholder?: string; defaultValue?: string; onSubmit: (value: string) => void }
  | { type: "alert"; title: string; message?: string; buttons?: { label: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[] }

// ── Context ──────────────────────────────────────────────────────────────────

interface ModalActions {
  showActionSheet: (title: string | undefined, options: ActionSheetOption[]) => void
  showConfirm: (title: string, message: string | undefined, confirmLabel: string, onConfirm: () => void, destructive?: boolean) => void
  showPrompt: (title: string, defaultValue: string | undefined, onSubmit: (value: string) => void, placeholder?: string) => void
  showAlert: (title: string, message?: string, buttons?: { label: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[]) => void
  dismiss: () => void
}

const ModalContext = createContext<ModalActions | null>(null)

export function useModal() {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error("useModal must be used within ModalProvider")
  return ctx
}

// ── Backdrop ─────────────────────────────────────────────────────────────────

function Backdrop({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable
          onPress={onPress}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Action Sheet ─────────────────────────────────────────────────────────────

function ActionSheet({ title, options, onDismiss }: { title?: string; options: ActionSheetOption[]; onDismiss: () => void }) {
  return (
    <Backdrop onPress={onDismiss}>
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 }}>
        {/* Handle */}
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
        </View>

        {title && (
          <Text style={{ color: c.fgSub, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, paddingBottom: 8 }}>
            {title}
          </Text>
        )}

        <ScrollView style={{ maxHeight: 400 }}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => { onDismiss(); setTimeout(() => opt.onPress(), 350) }}
              style={{
                paddingHorizontal: 20, paddingVertical: 14,
                flexDirection: "row", alignItems: "center", gap: 12,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border,
              }}
            >
              {opt.icon && <Text style={{ fontSize: 16 }}>{opt.icon}</Text>}
              <Text style={{
                color: opt.destructive ? "#f87171" : c.fg,
                fontSize: 15, fontWeight: "500",
              }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Cancel */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={onDismiss}
            style={{ backgroundColor: c.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
          >
            <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Backdrop>
  )
}

// ── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, confirmDestructive, onConfirm, onDismiss }: {
  title: string; message?: string; confirmLabel?: string; confirmDestructive?: boolean; onConfirm: () => void; onDismiss: () => void
}) {
  return (
    <Backdrop onPress={onDismiss}>
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
        <View style={{ alignItems: "center", paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
        </View>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", marginBottom: 8, marginTop: 8 }}>{title}</Text>
        {message && <Text style={{ color: c.fgSub, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>{message}</Text>}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={onDismiss}
            style={{ flex: 1, backgroundColor: c.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
          >
            <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { onDismiss(); onConfirm() }}
            style={{
              flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center",
              backgroundColor: confirmDestructive ? "#ef4444" : c.fgBright,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>{confirmLabel ?? "Confirm"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Backdrop>
  )
}

// ── Prompt Dialog ────────────────────────────────────────────────────────────

function PromptDialog({ title, placeholder, defaultValue, onSubmit, onDismiss }: {
  title: string; placeholder?: string; defaultValue?: string; onSubmit: (value: string) => void; onDismiss: () => void
}) {
  const [value, setValue] = useState(defaultValue ?? "")
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  return (
    <Backdrop onPress={onDismiss}>
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
        <View style={{ alignItems: "center", paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
        </View>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", marginBottom: 12, marginTop: 8 }}>{title}</Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={c.placeholder}
          autoFocus
          style={{
            backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 10,
            padding: 14, color: c.fg, fontSize: 15, marginBottom: 16,
          }}
          onSubmitEditing={() => {
            if (value.trim()) { onDismiss(); onSubmit(value.trim()) }
          }}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={onDismiss}
            style={{ flex: 1, backgroundColor: c.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
          >
            <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (value.trim()) { onDismiss(); onSubmit(value.trim()) } }}
            style={{
              flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center",
              backgroundColor: value.trim() ? c.fgBright : c.secondary,
            }}
          >
            <Text style={{ color: value.trim() ? c.fgBrightFg : c.fgSub, fontSize: 15, fontWeight: "600" }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Backdrop>
  )
}

// ── Alert Dialog ─────────────────────────────────────────────────────────────

function AlertDialog({ title, message, buttons, onDismiss }: {
  title: string; message?: string; buttons?: { label: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[]; onDismiss: () => void
}) {
  const btns = buttons ?? [{ label: "OK" }]
  return (
    <Backdrop onPress={onDismiss}>
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
        <View style={{ alignItems: "center", paddingBottom: 6 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.secondary }} />
        </View>
        <Text style={{ color: c.fg, fontSize: 17, fontWeight: "700", marginBottom: 8, marginTop: 8 }}>{title}</Text>
        {message && <Text style={{ color: c.fgSub, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>{message}</Text>}
        <View style={{ gap: 8 }}>
          {btns.map((btn, i) => {
            const isCancel = btn.style === "cancel"
            const isDestructive = btn.style === "destructive"
            return (
              <TouchableOpacity
                key={i}
                onPress={() => { onDismiss(); btn.onPress?.() }}
                style={{
                  borderRadius: 12, paddingVertical: 14, alignItems: "center",
                  backgroundColor: isDestructive ? "#ef4444" : isCancel ? c.secondary : c.fgBright,
                }}
              >
                <Text style={{ color: isCancel ? c.fg : "#fff", fontSize: 15, fontWeight: "600" }}>{btn.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </Backdrop>
  )
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ModalState>({ type: "none" })

  const dismiss = useCallback(() => setState({ type: "none" }), [])

  const actions: ModalActions = {
    showActionSheet: (title, options) => setState({ type: "action-sheet", title, options }),
    showConfirm: (title, message, confirmLabel, onConfirm, destructive) =>
      setState({ type: "confirm", title, message, confirmLabel, confirmDestructive: destructive, onConfirm }),
    showPrompt: (title, defaultValue, onSubmit, placeholder) =>
      setState({ type: "prompt", title, defaultValue, onSubmit, placeholder }),
    showAlert: (title, message, buttons) =>
      setState({ type: "alert", title, message, buttons }),
    dismiss,
  }

  return (
    <ModalContext.Provider value={actions}>
      {children}
      {state.type === "action-sheet" && (
        <ActionSheet title={state.title} options={state.options} onDismiss={dismiss} />
      )}
      {state.type === "confirm" && (
        <ConfirmDialog
          title={state.title} message={state.message}
          confirmLabel={state.confirmLabel} confirmDestructive={state.confirmDestructive}
          onConfirm={state.onConfirm} onDismiss={dismiss}
        />
      )}
      {state.type === "prompt" && (
        <PromptDialog
          title={state.title} placeholder={state.placeholder}
          defaultValue={state.defaultValue} onSubmit={state.onSubmit} onDismiss={dismiss}
        />
      )}
      {state.type === "alert" && (
        <AlertDialog title={state.title} message={state.message} buttons={state.buttons} onDismiss={dismiss} />
      )}
    </ModalContext.Provider>
  )
}
