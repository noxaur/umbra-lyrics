const MIGRATION_FLAG_KEY = "umbra-migrated-from-song-kara"

const EXACT_KEY_MAP: Record<string, string> = {
  "song-kara-video-hidden": "umbra-video-hidden",
  "song-kara-show-timestamps": "umbra-show-timestamps",
  "song-kara-focus-mode": "umbra-focus-mode",
  "song-kara-tv-mode": "umbra-tv-mode",
  "song-kara-queue-pending-metadata": "umbra-queue-pending-metadata",
  "song-kara-queue-settings": "umbra-queue-settings",
  "song-kara-display-settings": "umbra-display-settings",
  "song-kara-queue": "umbra-queue",
  "song-kara-theme-id": "umbra-theme-id",
  "song-kara-theme": "umbra-theme",
  "song-kara-theme-cache": "umbra-theme-cache",
  "song-kara:spotify-auth": "umbra:spotify-auth",
  "song-kara:spotify-pkce": "umbra:spotify-pkce",
  "song-kara:spotify-return": "umbra:spotify-return",
  "song-kara-recent": "umbra-recent",
  "song-kara-playlists": "umbra-playlists",
  "song-kara-playlist-index-issues": "umbra-playlist-index-issues",
  "song-kara-pasted-lyrics": "umbra-pasted-lyrics",
  "song-kara-custom-themes": "umbra-custom-themes",
}

const PREFIX_KEY_MAP: Record<string, string> = {
  "song-kara-lyrics:": "umbra-lyrics:",
  "song-kara-translate:": "umbra-translate:",
}

function migrateKey(from: string, to: string): void {
  const value = localStorage.getItem(from)
  if (value === null) return
  if (localStorage.getItem(to) === null) {
    localStorage.setItem(to, value)
  }
  localStorage.removeItem(from)
}

/** One-time copy of song-kara localStorage keys to umbra equivalents. */
export function migrateSongKaraStorage(): void {
  if (typeof localStorage === "undefined") return
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return

  for (const [from, to] of Object.entries(EXACT_KEY_MAP)) {
    migrateKey(from, to)
  }

  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) keys.push(key)
  }

  for (const key of keys) {
    for (const [fromPrefix, toPrefix] of Object.entries(PREFIX_KEY_MAP)) {
      if (!key.startsWith(fromPrefix)) continue
      const to = toPrefix + key.slice(fromPrefix.length)
      migrateKey(key, to)
    }
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, "1")
}
