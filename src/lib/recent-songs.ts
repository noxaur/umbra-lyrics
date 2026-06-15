import { detectLanguage, hasCjkScript, isEnglish } from "@/lib/language-service"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { translateLinesWithFallback } from "@/lib/translation-service"

const STORAGE_KEY = "song-kara-recent"
const MAX_RECENT = 10
const CYRILLIC_RE = /[\u0400-\u04ff]/
const HANGUL_RE = /[\uac00-\ud7af]/

export type RecentSong = {
  videoId: string
  title: string
  artist: string
  track: string
  englishArtist?: string
  englishTrack?: string
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

export function needsEnglishSubtitle(text: string): boolean {
  const sample = text.trim()
  if (!sample) return false
  if (hasCjkScript(sample) || HANGUL_RE.test(sample) || CYRILLIC_RE.test(sample)) return true
  return !isEnglish(detectLanguage(sample))
}

function primaryRecentLabel(song: RecentSong): string {
  const normalized = normalizeRecent(song)
  if (normalized.artist && normalized.track) {
    return `${normalized.artist} · ${normalized.track}`
  }
  return normalized.title?.trim() || normalized.videoId
}

export function formatRecentLabel(song: RecentSong): string {
  const normalized = normalizeRecent(song)
  const primary = primaryRecentLabel(normalized)
  const meta = `${normalized.artist} ${normalized.track}`.trim()

  if (
    needsEnglishSubtitle(meta) &&
    normalized.englishArtist?.trim() &&
    normalized.englishTrack?.trim()
  ) {
    const english = `${normalized.englishArtist.trim()} · ${normalized.englishTrack.trim()}`
    if (english !== primary) return `${primary} (${english})`
  }

  return primary
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
