import { createContext, useState, useEffect, useContext, useMemo } from "react"
import { Platform } from "react-native"
import { Stack, useRouter } from "expo-router"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { configureStorage, configureAgentErrorHandler, useAgentEvents, getActiveServer } from "@huxflux/shared"
import type { AgentSummary } from "@huxflux/shared"
import { ModalProvider, useModal } from "../components/Modal"
import { StatusBar } from "expo-status-bar"
import { ThemeContext, applyTheme, themes, c } from "../theme"
import { PREF_KEYS } from "../lib/prefs"
import * as Notifications from "expo-notifications"

// Show notifications when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// Android requires a notification channel
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Agent notifications",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  })
}

// Synchronous in-memory store backed by AsyncStorage.
const cache = new Map<string, string>()

configureStorage({
  getItem: (key) => cache.get(key) ?? null,
  setItem: (key, value) => {
    cache.set(key, value)
    AsyncStorage.setItem(key, value)
  },
  removeItem: (key) => {
    cache.delete(key)
    AsyncStorage.removeItem(key)
  },
})

const STORAGE_KEYS = ["huxflux:servers", "huxflux:active-server", "huxflux:mobile-theme", ...PREF_KEYS]

const HydrationContext = createContext(false)
export function useHydrated() { return useContext(HydrationContext) }

// Deferred — set once ModalProvider mounts
let _showAlert: ((title: string, message?: string) => void) | null = null
export function setGlobalAlert(fn: typeof _showAlert) { _showAlert = fn }

configureAgentErrorHandler((message) => {
  if (_showAlert) _showAlert("Agent error", message)
})

let queryClient: QueryClient

function AppContent({ hydrated }: { hydrated: boolean }) {
  const modal = useModal()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { themeId } = useContext(ThemeContext)

  // Register global alert for configureAgentErrorHandler
  useEffect(() => {
    setGlobalAlert((title, message) => modal.showAlert(title, message))
    return () => setGlobalAlert(null)
  }, [modal])

  // Request notification permission once after hydration
  useEffect(() => {
    if (!hydrated) return
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status !== "granted") Notifications.requestPermissionsAsync()
    })

    // Navigate to agent when tapped from a killed state (cold start only)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      const receivedAt = response.notification.date * 1000
      if (Date.now() - receivedAt > 30_000) return // stale — ignore
      const agentId = response.notification.request.content.data?.agentId
      if (agentId) router.push(`/agent/${agentId}`)
    })

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const agentId = response.notification.request.content.data?.agentId
      if (agentId) router.push(`/agent/${agentId}`)
    })

    return () => tapSub.remove()
  }, [hydrated, router])

  // Fire a local notification whenever an agent finishes a turn
  useAgentEvents(null, (event) => {
    if (event.type !== "message:done") return
    const serverUrl = getActiveServer()?.url ?? null
    const agents = queryClient.getQueryData<AgentSummary[]>(["agents", serverUrl])
    const agent = agents?.find((a) => a.id === event.agentId)
    Notifications.scheduleNotificationAsync({
      content: {
        title: agent?.title ?? "Agent",
        body: "Finished",
        data: { agentId: event.agentId },
        sound: true,
      },
      trigger: null,
    })
  })

  return (
    <HydrationContext.Provider value={hydrated}>
      <Stack
        key={themeId}
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.fg,
          headerTitleStyle: { fontWeight: "600", fontSize: 16 },
          contentStyle: { backgroundColor: c.bg },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="agent/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="servers" options={{ title: "Servers", presentation: "modal" }} />
        <Stack.Screen name="new-agent" options={{ title: "New Agent", presentation: "modal" }} />
        <Stack.Screen name="add-repo" options={{ title: "Add Repo", presentation: "modal" }} />
      </Stack>
    </HydrationContext.Provider>
  )
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false)
  const [themeId, setThemeIdState] = useState("stone")

  function setThemeId(id: string) {
    applyTheme(id)
    setThemeIdState(id)
    cache.set("huxflux:mobile-theme", id)
    AsyncStorage.setItem("huxflux:mobile-theme", id)
  }

  const themeCtx = useMemo(() => ({ themeId, setThemeId }), [themeId])

  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: false },
      },
    })
  }

  useEffect(() => {
    AsyncStorage.multiGet(STORAGE_KEYS).then((pairs) => {
      for (const [key, value] of pairs) {
        if (value !== null) cache.set(key, value)
      }
      // Apply persisted theme before first render
      const savedTheme = cache.get("huxflux:mobile-theme")
      if (savedTheme) {
        applyTheme(savedTheme)
        setThemeIdState(savedTheme)
      }
      setHydrated(true)
      queryClient.invalidateQueries()
    })
  }, [])

  const isLight = themes.find((t) => t.id === themeId)?.light ?? false

  return (
    <ThemeContext.Provider value={themeCtx}>
      <StatusBar style={isLight ? "dark" : "light"} />
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <AppContent hydrated={hydrated} />
        </ModalProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  )
}
