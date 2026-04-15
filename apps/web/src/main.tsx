import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "sonner"
import { configureStorage, configureAgentErrorHandler } from "@huxflux/shared"
import { applyTheme, getTheme, watchSystemTheme } from "./lib/theme"
import "./index.css"

// Apply theme before first render to avoid flash, then watch for OS changes
applyTheme(getTheme())
watchSystemTheme()

// Mark Tauri context so CSS can scope desktop-only styles
if (!!import.meta.env.TAURI_PLATFORM || '__TAURI_INTERNALS__' in window) {
  document.documentElement.classList.add("tauri")
}
import { RouterProvider } from "@tanstack/react-router"
import { createAppRouter } from "./router"
import { ErrorBoundary } from "./components/ErrorBoundary.tsx"

// Initialize shared library with web-specific platform adapters
configureStorage(localStorage)
configureAgentErrorHandler((message) => {
  if (/abort/i.test(message)) return
  toast.error("Agent error", { description: message, duration: 6000 })
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

const router = createAppRouter(queryClient)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
