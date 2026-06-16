import { detectLanguage, hasCjkScript, isEnglish } from "@/lib/language-service"
import { parseTrackTitle } from "@/lib/parse-track-title"

const CYRILLIC_RE = /[\u0400-\u04ff]/
const HANGUL_RE = /[\uac00-\ud7af]/

export type TrackMetadata = {
  videoId: string
  title: string
  artist: string
  track: string
  englishArtist?: string
  englishTrack?: string
}

export function normalizeTrackMetadata(track: TrackMetadata): TrackMetadata {
  if (track.artist?.trim() && track.track?.trim()) return track
  const parsed = parseTrackTitle(track.title || "")
  return {
    ...track,
    artist: track.artist?.trim() || parsed.artist,
    track: track.track?.trim() || parsed.track,
  }
}

export function needsEnglishSubtitle(text: string): boolean {
  const sample = text.trim()
  if (!sample) return false
  if (hasCjkScript(sample) || HANGUL_RE.test(sample) || CYRILLIC_RE.test(sample)) return true
  return !isEnglish(detectLanguage(sample))
}

function primaryTrackLabel(track: TrackMetadata): string {
  const normalized = normalizeTrackMetadata(track)
  if (normalized.artist && normalized.track) {
    return `${normalized.artist} · ${normalized.track}`
  }
  return normalized.title?.trim() || normalized.videoId
}

export function formatTrackLabel(track: TrackMetadata): string {
  const normalized = normalizeTrackMetadata(track)
  const primary = primaryTrackLabel(normalized)
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
