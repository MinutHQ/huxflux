import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { configureStorage, configureAgentErrorHandler } from "@hive/shared"
import { applyTheme, getTheme, watchSystemTheme } from "./lib/theme"
import "./index.css"
import App from "./App.tsx"

// Apply theme before first render to avoid flash, then watch for OS changes
applyTheme(getTheme())
watchSystemTheme()

// Tauri's WebView has its own persistent localStorage (stored in app data dir)
configureStorage(localStorage)

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
