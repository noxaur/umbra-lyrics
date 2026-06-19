import { clearLyricsCache, getLyricsCache } from "@/lib/lyrics-cache"
import { clearPlaylistIndexIssue } from "@/lib/playlist-index-issues"
import { getPlaylistById } from "@/lib/playlists"

const STORAGE_KEY = "umbra-lyrics-rejected"

export type LyricsRejectionEntry = {
  videoId: string
  rejectedAt: number
}

type RejectionListener = () => void
const listeners = new Set<RejectionListener>()

function notify(): void {
  for (const listener of listeners) listener()
}

function readRejections(): LyricsRejectionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is LyricsRejectionEntry =>
        !!item &&
        typeof item === "object" &&
        typeof (item as LyricsRejectionEntry).videoId === "string" &&
        typeof (item as LyricsRejectionEntry).rejectedAt === "number",
    )
  } catch {
    return []
  }
}

function writeRejections(entries: LyricsRejectionEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  notify()
}

export function subscribeLyricsRejections(listener: RejectionListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isLyricsRejected(videoId: string): boolean {
  return readRejections().some((entry) => entry.videoId === videoId)
}

export function listRejectedLyrics(): LyricsRejectionEntry[] {
  return readRejections()
}

export function clearLyricsRejection(videoId: string): void {
  const next = readRejections().filter((entry) => entry.videoId !== videoId)
  if (next.length === readRejections().length) return
  writeRejections(next)
}

export function rejectLyrics(videoId: string): void {
  clearLyricsCache(videoId)
  clearPlaylistIndexIssue(videoId)
  const existing = readRejections().filter((entry) => entry.videoId !== videoId)
  existing.push({ videoId, rejectedAt: Date.now() })
  writeRejections(existing)
}

export function rejectLyricsForTracks(videoIds: string[]): number {
  const unique = [...new Set(videoIds.filter(Boolean))]
  for (const videoId of unique) rejectLyrics(videoId)
  return unique.length
}

export function rejectLyricsForPlaylist(playlistId: string, videoIds?: string[]): number {
  const playlist = getPlaylistById(playlistId)
  if (!playlist) return 0

  const targets = videoIds
    ? playlist.tracks.filter((track) => videoIds.includes(track.videoId))
    : playlist.tracks

  return rejectLyricsForTracks(targets.map((track) => track.videoId))
}

export function countIndexedLyricsInPlaylist(playlistId: string): number {
  const playlist = getPlaylistById(playlistId)
  if (!playlist) return 0
  return playlist.tracks.filter((track) => getLyricsCache(track.videoId)).length
}
