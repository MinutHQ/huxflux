import { useState, useEffect } from "react"
import { Stack } from "expo-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { configureStorage, configureAgentErrorHandler } from "@hive/shared"
import { Alert } from "react-native"

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

configureAgentErrorHandler((message) => {
  Alert.alert("Agent error", message)
})

const STORAGE_KEYS = ["huxflux:servers", "huxflux:active-server"]

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    AsyncStorage.multiGet(STORAGE_KEYS).then((pairs) => {
      for (const [key, value] of pairs) {
        if (value !== null) cache.set(key, value)
      }
      setHydrated(true)
    })
  }, [])

  // Always render the navigator — Expo Router requires it.
  // Screens handle their own loading state until hydrated.
  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0a0a0a" },
          headerTintColor: "#fafafa",
          headerTitleStyle: { fontWeight: "600", fontSize: 16 },
          contentStyle: { backgroundColor: "#0a0a0a" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="agent/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="servers" options={{ title: "Servers", presentation: "modal" }} />
        <Stack.Screen name="new-agent" options={{ title: "New Agent", presentation: "modal" }} />
      </Stack>
    </QueryClientProvider>
  )
}
