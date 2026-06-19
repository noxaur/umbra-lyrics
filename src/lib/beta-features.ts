const MKV_EXPORT_KEY = "song-kara-beta-mkv-export"
const MKV_EXPORT_PARAM = "mkv-export"

/** Persist opt-in when user visits with ?beta=mkv-export (legacy discovery URL). */
export function syncMkvExportFromUrl(): void {
  if (typeof window === "undefined") return
  if (new URLSearchParams(window.location.search).get("beta") !== MKV_EXPORT_PARAM) return
  try {
    localStorage.setItem(MKV_EXPORT_KEY, "true")
  } catch {
    // ignore quota / private mode
  }
}
