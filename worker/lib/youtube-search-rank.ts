export type SongSearchHit = {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
  viewCount?: number
}

const BOOST_RE =
  /\b(official|lyrics|karaoke|mv|music video|audio)\b|歌詞|ミュージックビデオ/i
const PENALIZE_RE = /\b(cover|reaction|tutorial|lesson|behind the scenes|interview)\b/i
const SHORTS_RE = /\bshorts?\b|#shorts/i

export function scoreSongSearchHit(hit: SongSearchHit): number {
  let score = 0
  const title = hit.title.toLowerCase()

  if (BOOST_RE.test(hit.title)) score -= 12
  if (PENALIZE_RE.test(hit.title)) score += 18
  if (SHORTS_RE.test(hit.title)) score += 25

  const duration = hit.durationSec ?? 0
  if (duration > 0) {
    if (duration < 60) score += 30
    else if (duration >= 120 && duration <= 480) score -= 6
    else if (duration > 900) score += 8
  }

  if (hit.viewCount && hit.viewCount > 0) {
    score -= Math.min(8, Math.log10(hit.viewCount))
  }

  if (!title.trim()) score += 50

  return score
}

export function rankSongSearchHits(hits: SongSearchHit[]): SongSearchHit[] {
  return [...hits].sort((a, b) => scoreSongSearchHit(a) - scoreSongSearchHit(b))
}
