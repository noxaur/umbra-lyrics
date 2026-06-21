import { createProxyLyricsProvider } from "./proxy-provider"

export const animelyricsProvider = createProxyLyricsProvider({
  id: "animelyrics",
  label: "AnimeLyrics",
  priority: 9,
  supportsSync: false,
  searchPhase: "Trying AnimeLyrics…",
  apiPath: "/api/lyrics/animelyrics/search",
  defaultLanguageHint: "ja",
})
