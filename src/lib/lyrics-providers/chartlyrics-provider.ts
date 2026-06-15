import { createProxyLyricsProvider } from "./proxy-provider"

export const chartlyricsProvider = createProxyLyricsProvider({
  id: "chartlyrics",
  label: "ChartLyrics",
  priority: 5,
  supportsSync: false,
  searchPhase: "Trying ChartLyrics…",
  apiPath: "/api/lyrics/chartlyrics/search",
})
