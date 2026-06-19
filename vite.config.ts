/// <reference types="@voidzero-dev/vite-plus-test" />
import path from "path"
import type { Plugin } from "vite"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { cloudflare } from "@cloudflare/vite-plugin"
import { defineConfig } from "vite-plus"
import { isolationHeadersForUserAgent } from "./worker/headers"

function browserAwareIsolationHeaders(): Plugin {
  return {
    name: "browser-aware-isolation-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const userAgent = req.headers["user-agent"] ?? ""
        for (const [key, value] of Object.entries(isolationHeadersForUserAgent(userAgent))) {
          res.setHeader(key, value)
        }
        next()
      })
    },
  }
}

export default defineConfig({
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [browserAwareIsolationHeaders()]),
    ...(process.env.VITEST
      ? []
      : [cloudflare({ configPath: "./wrangler.legacy.jsonc" })]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "onnxruntime-common": path.resolve(
        __dirname,
        "node_modules/onnxruntime-common",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
})
