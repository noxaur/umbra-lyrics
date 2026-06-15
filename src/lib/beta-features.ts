const MKV_EXPORT_KEY = "song-kara-beta-mkv-export"
const MKV_EXPORT_PARAM = "mkv-export"

/** Beta MKV export is always available in the UI (marked with a Beta badge). */
export function isMkvExportEnabled(): boolean {
  return true
}

/** Persist opt-in when user visits with ?beta=mkv-export (legacy discovery URL). */
export function syncMkvExportFromUrl(): void {
  if (typeof window === "undefined") return
  if (new URLSearchParams(window.location.search).get("beta") !== MKV_EXPORT_PARAM) return
  setMkvExportOptIn(true)
}

export function isMkvExportParamActive(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("beta") === MKV_EXPORT_PARAM
}

export function getMkvExportOptIn(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(MKV_EXPORT_KEY) === "true"
  } catch {
    return false
  }
}

export function setMkvExportOptIn(enabled: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (enabled) {
      localStorage.setItem(MKV_EXPORT_KEY, "true")
    } else {
      localStorage.removeItem(MKV_EXPORT_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
}
