import { createProxyLyricsProvider } from "./proxy-provider"

export const songmeaningsProvider = createProxyLyricsProvider({
  id: "songmeanings",
  label: "SongMeanings",
  priority: 12,
  supportsSync: false,
  searchPhase: "Trying SongMeanings…",
  apiPath: "/api/lyrics/songmeanings/search",
})
