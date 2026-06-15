import { createProxyLyricsProvider } from "./proxy-provider"

export const geniusProvider = createProxyLyricsProvider({
  id: "genius",
  label: "Genius",
  priority: 6,
  supportsSync: false,
  searchPhase: "Trying Genius…",
  apiPath: "/api/lyrics/genius/search",
})
