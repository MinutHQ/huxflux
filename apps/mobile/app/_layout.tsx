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

// QueryClient is created inside the component so we can disable queries until hydration is done.
let queryClient: QueryClient

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false)

  // Create QueryClient once, with queries disabled until hydration is done.
  // This prevents React Query from fetching with a stale/default server URL
  // before AsyncStorage has populated the cache.
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
      setHydrated(true)
      // Now that storage is hydrated, invalidate any queries that may have
      // been initiated before the correct server URL was available.
      queryClient.invalidateQueries()
    })
  }, [])

  // Always render the navigator — Expo Router requires it.
  // Block data-fetching children until storage is hydrated.
  if (!hydrated) {
    return (
      <QueryClientProvider client={queryClient}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#1c1917" },
            headerTintColor: "#fafaf9",
            headerTitleStyle: { fontWeight: "600", fontSize: 16 },
            contentStyle: { backgroundColor: "#1c1917" },
            animation: "fade",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#1c1917" },
          headerTintColor: "#fafaf9",
          headerTitleStyle: { fontWeight: "600", fontSize: 16 },
          contentStyle: { backgroundColor: "#1c1917" },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="agent/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="servers" options={{ title: "Servers", presentation: "modal" }} />
        <Stack.Screen name="new-agent" options={{ title: "New Agent", presentation: "modal" }} />
        <Stack.Screen name="add-repo" options={{ title: "Add Repo", presentation: "modal" }} />
      </Stack>
    </QueryClientProvider>
  )
}
