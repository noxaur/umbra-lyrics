import { parseTrackTitle } from "@/lib/parse-track-title"

const STORAGE_KEY = "song-kara-recent"
const MAX_RECENT = 10

export type RecentSong = {
  videoId: string
  title: string
  artist: string
  track: string
  playedAt: number
}

function normalizeRecent(song: RecentSong): RecentSong {
  if (song.artist?.trim() && song.track?.trim()) return song
  const parsed = parseTrackTitle(song.title || "")
  return {
    ...song,
    artist: song.artist?.trim() || parsed.artist,
    track: song.track?.trim() || parsed.track,
  }
}

export function formatRecentLabel(song: RecentSong): string {
  const normalized = normalizeRecent(song)
  if (normalized.artist && normalized.track) {
    return `${normalized.artist} · ${normalized.track}`
  }
  return normalized.title?.trim() || normalized.videoId
}

export function getRecentSongs(): RecentSong[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentSong[]
    return parsed.map(normalizeRecent)
  } catch {
    return []
  }
}

export function addRecentSong(song: Omit<RecentSong, "playedAt">) {
  const normalized = normalizeRecent({ ...song, playedAt: 0 })
  const existing = getRecentSongs().filter((s) => s.videoId !== normalized.videoId)
  const next: RecentSong[] = [
    { ...normalized, playedAt: Date.now() },
    ...existing,
  ].slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearRecentSongs() {
  localStorage.removeItem(STORAGE_KEY)
}
