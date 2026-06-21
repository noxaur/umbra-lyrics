import { createProxyLyricsProvider } from "./proxy-provider"

export const petitlyricsProvider = createProxyLyricsProvider({
  id: "petitlyrics",
  label: "PetitLyrics",
  priority: 7,
  supportsSync: true,
  searchPhase: "Trying PetitLyrics…",
  apiPath: "/api/lyrics/petitlyrics/search",
  defaultLanguageHint: "ja",
})
