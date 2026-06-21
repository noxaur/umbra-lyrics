import { createProxyLyricsProvider } from "./proxy-provider"

export const lyricstranslateProvider = createProxyLyricsProvider({
  id: "lyricstranslate",
  label: "LyricsTranslate",
  priority: 8,
  supportsSync: false,
  searchPhase: "Trying LyricsTranslate…",
  apiPath: "/api/lyrics/lyricstranslate/search",
})
