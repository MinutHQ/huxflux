import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  server: {
    host: "0.0.0.0",
    // Vite 8 forwards browser console output to the dev server over the HMR
    // socket, but its transport crashes ("can't access property 'send' of
    // undefined") whenever the socket is not open, and the unhandled-rejection
    // hook it installs re-forwards that crash, snowballing into thousands of
    // errors during any reconnect window. Off until upstream guards the send.
    forwardConsole: false,
  },
  preview: {
    host: "0.0.0.0",
  },
})
