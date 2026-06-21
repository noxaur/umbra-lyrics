/** One-time copy of pre-rebrand `song-kara-*` localStorage keys to `umbra-*`. */
export const REBRAND_MIGRATION_KEY = "umbra-rebrand-migrated-v1"

const EXACT_KEY_MAP: Record<string, string> = {
  "song-kara-custom-themes": "umbra-custom-themes",
  "song-kara-display-settings": "umbra-display-settings",
  "song-kara-pasted-lyrics": "umbra-pasted-lyrics",
  "song-kara-playlist-index-issues": "umbra-playlist-index-issues",
  "song-kara-playlists": "umbra-playlists",
  "song-kara-queue-pending-metadata": "umbra-queue-pending-metadata",
  "song-kara-recent": "umbra-recent",
  "song-kara-queue-settings": "umbra-queue-settings",
  "song-kara-queue": "umbra-queue",
  "song-kara:spotify-auth": "umbra:spotify-auth",
  "song-kara:spotify-pkce": "umbra:spotify-pkce",
  "song-kara:spotify-return": "umbra:spotify-return",
  "song-kara-theme-id": "umbra-theme-id",
  "song-kara-theme": "umbra-theme",
  "song-kara-theme-cache": "umbra-theme-cache",
  "song-kara-video-hidden": "umbra-video-hidden",
  "song-kara-show-timestamps": "umbra-show-timestamps",
  "song-kara-focus-mode": "umbra-focus-mode",
  "song-kara-tv-mode": "umbra-tv-mode",
}

const PREFIX_KEY_MAP: Array<[string, string]> = [
  ["song-kara-lyrics:", "umbra-lyrics:"],
  ["song-kara-translate:", "umbra-translate:"],
]

export function migrateSongKaraStorage(): void {
  if (typeof localStorage === "undefined") return
  if (localStorage.getItem(REBRAND_MIGRATION_KEY)) return

  for (const [oldKey, newKey] of Object.entries(EXACT_KEY_MAP)) {
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
    }
    if (value !== null) localStorage.removeItem(oldKey)
  }

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key) continue

    for (const [oldPrefix, newPrefix] of PREFIX_KEY_MAP) {
      if (!key.startsWith(oldPrefix)) continue

      const newKey = `${newPrefix}${key.slice(oldPrefix.length)}`
      const value = localStorage.getItem(key)
      if (value !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value)
      }
      if (value !== null) localStorage.removeItem(key)
    }
  }

  localStorage.setItem(REBRAND_MIGRATION_KEY, "1")
}
