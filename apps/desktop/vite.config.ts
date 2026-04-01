import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const webRoot = path.resolve(__dirname, '../web')

// The desktop app has no JS source of its own — it uses apps/web as its
// frontend. This config points Vite at the web app's root so that
// `tauri dev` and `tauri build` serve/build the same source as the web app.
export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(webRoot, 'src'),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Output to apps/desktop/dist so tauri.conf.json's frontendDist: "../dist" resolves correctly
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
