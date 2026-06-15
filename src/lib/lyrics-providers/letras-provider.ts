import { createProxyLyricsProvider } from "./proxy-provider"

export const letrasProvider = createProxyLyricsProvider({
  id: "letras",
  label: "Letras.mus.br",
  priority: 13,
  supportsSync: false,
  searchPhase: "Trying Letras.mus.br…",
  apiPath: "/api/lyrics/letras/search",
  defaultLanguageHint: "es",
})
