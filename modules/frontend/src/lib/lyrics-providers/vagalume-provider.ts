import { createProxyLyricsProvider } from "./proxy-provider"

export const vagalumeProvider = createProxyLyricsProvider({
  id: "vagalume",
  label: "Vagalume",
  priority: 10,
  supportsSync: false,
  searchPhase: "Trying Vagalume…",
  apiPath: "/api/lyrics/vagalume/search",
  defaultLanguageHint: "pt",
})
