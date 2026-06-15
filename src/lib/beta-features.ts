const MKV_EXPORT_KEY = "song-kara-beta-mkv-export"
const MKV_EXPORT_PARAM = "mkv-export"

/** Beta MKV export enabled via ?beta=mkv-export or persisted localStorage opt-in. */
export function isMkvExportEnabled(): boolean {
  if (typeof window === "undefined") return false

  const params = new URLSearchParams(window.location.search)
  if (params.get("beta") === MKV_EXPORT_PARAM) return true

  try {
    return localStorage.getItem(MKV_EXPORT_KEY) === "true"
  } catch {
    return false
  }
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
