/// <reference types="vitest/config" />
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { lyricsProxyMiddleware } from "./vite.lyrics-proxy"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "lyrics-api-proxy",
      configureServer(server) {
        server.middlewares.use(lyricsProxyMiddleware())
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
})
