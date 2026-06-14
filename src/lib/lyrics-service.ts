import type { LyricsResult } from "@/types/lyrics"

const BASE = "https://lrclib.net/api"
const CLIENT_HEADER = "Lrclib-Client: song-kara/1.0.0 (https://github.com/song-kara)"

type SearchResult = {
  id: number
  trackName: string
  artistName: string
  duration: number
}

export type FetchLyricsParams = {
  track: string
  artist: string
  album: string
  durationSec: number
}

async function searchLyrics(params: FetchLyricsParams): Promise<SearchResult[]> {
  const q = new URLSearchParams({
    track_name: params.track,
    artist_name: params.artist,
  })
  const res = await fetch(`${BASE}/search?${q}`, {
    headers: { "Lrclib-Client": CLIENT_HEADER },
  })
  if (!res.ok) return []
  return res.json()
}

function pickBestMatch(results: SearchResult[], durationSec: number): SearchResult | null {
  if (results.length === 0) return null
  let best = results[0]
  let bestDelta = Math.abs(best.duration - durationSec)
  for (const r of results) {
    const delta = Math.abs(r.duration - durationSec)
    if (delta < bestDelta) {
      best = r
      bestDelta = delta
    }
  }
  return bestDelta <= 2 ? best : results[0]
}

export async function fetchLyrics(params: FetchLyricsParams): Promise<LyricsResult | null> {
  const results = await searchLyrics(params)
  const match = pickBestMatch(results, params.durationSec)
  if (!match) return null

  const q = new URLSearchParams({
    track_name: params.track,
    artist_name: params.artist,
    album_name: params.album,
    duration: String(match.duration),
  })

  const res = await fetch(`${BASE}/get?${q}`, {
    headers: { "Lrclib-Client": CLIENT_HEADER },
  })

  if (res.status === 404) return null
  if (!res.ok) return null

  const data = await res.json()
  return {
    id: data.id,
    plainLyrics: data.plainLyrics ?? null,
    syncedLyrics: data.syncedLyrics ?? null,
  }
}

export async function searchEnglishLyrics(
  track: string,
  artist: string,
  durationSec: number,
): Promise<LyricsResult | null> {
  return fetchLyrics({
    track: `${track} english`,
    artist,
    album: "",
    durationSec,
  })
}
