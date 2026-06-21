import { createProxyLyricsProvider } from "./proxy-provider"

export const lyricswikiProvider = createProxyLyricsProvider({
  id: "lyricswiki",
  label: "Lyrics Wiki",
  priority: 11,
  supportsSync: false,
  searchPhase: "Trying Lyrics Wiki…",
  apiPath: "/api/lyrics/lyricswiki/search",
})
