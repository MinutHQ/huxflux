import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { Store } from "@tauri-apps/plugin-store"
import { configureStorage, configureAgentErrorHandler } from "@hive/shared"
import { applyTheme, getTheme, watchSystemTheme } from "./lib/theme"
import "./index.css"
import App from "./App.tsx"

// Apply theme before first render to avoid flash, then watch for OS changes
applyTheme(getTheme())
watchSystemTheme()

// Initialize Tauri store for persistent storage (replaces localStorage)
const store = await Store.load("config.json")
configureStorage({
  getItem: (key) => store.get<string>(key).then((v) => v ?? null),
  setItem: async (key, value) => { await store.set(key, value); await store.save() },
  removeItem: async (key) => { await store.delete(key); await store.save() },
})

configureAgentErrorHandler((message) => {
  toast.error("Agent error", { description: message, duration: 6000 })
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
