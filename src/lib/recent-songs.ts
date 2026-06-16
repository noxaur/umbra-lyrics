import { detectLanguage } from "@/lib/language-service"
import {
  formatTrackLabel,
  needsEnglishSubtitle,
  normalizeTrackMetadata,
  type TrackMetadata,
} from "@/lib/track-label"
import { translateLinesWithFallback } from "@/lib/translation-service"

const STORAGE_KEY = "song-kara-recent"
const MAX_RECENT = 10

export type RecentSong = TrackMetadata & {
  playedAt: number
}

function normalizeRecent(song: RecentSong): RecentSong {
  return {
    ...normalizeTrackMetadata(song),
    playedAt: song.playedAt,
  }
}

export { needsEnglishSubtitle }

export function formatRecentLabel(song: RecentSong): string {
  return formatTrackLabel(normalizeRecent(song))
}

function writeRecentSongs(songs: RecentSong[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
}

export function patchRecentSong(
  videoId: string,
  patch: Partial<Pick<RecentSong, "englishArtist" | "englishTrack">>,
) {
  const next = getRecentSongs().map((song) =>
    song.videoId === videoId ? { ...song, ...patch } : song,
  )
  writeRecentSongs(next)
}

export async function enrichRecentSongEnglish(videoId: string): Promise<boolean> {
  const song = getRecentSongs().find((entry) => entry.videoId === videoId)
  if (!song) return false

  const normalized = normalizeRecent(song)
  const meta = `${normalized.artist} ${normalized.track}`.trim()
  if (!needsEnglishSubtitle(meta)) return false
  if (normalized.englishArtist?.trim() && normalized.englishTrack?.trim()) return false
  if (!normalized.artist?.trim() || !normalized.track?.trim()) return false

  const result = await translateLinesWithFallback(
    [normalized.artist, normalized.track],
    {
      sourceLang: detectLanguage(meta),
      videoId: `${videoId}-recent-meta`,
    },
  )
  if (!result?.lines[0]?.trim() || !result.lines[1]?.trim()) return false

  patchRecentSong(videoId, {
    englishArtist: result.lines[0].trim(),
    englishTrack: result.lines[1].trim(),
  })
  return true
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
  writeRecentSongs(next)
}

export function clearRecentSongs() {
  localStorage.removeItem(STORAGE_KEY)
}
