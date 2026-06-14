const STORAGE_KEY = "song-kara-recent"
const MAX_RECENT = 10

export type RecentSong = {
  videoId: string
  title: string
  playedAt: number
}

export function getRecentSongs(): RecentSong[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as RecentSong[]
  } catch {
    return []
  }
}

export function addRecentSong(song: Omit<RecentSong, "playedAt">) {
  const existing = getRecentSongs().filter((s) => s.videoId !== song.videoId)
  const next: RecentSong[] = [
    { ...song, playedAt: Date.now() },
    ...existing,
  ].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearRecentSongs() {
  localStorage.removeItem(STORAGE_KEY)
}
