import {
  pickBestYouTubeMusicHit,
  type YouTubeMusicHit,
} from "../../../shared/youtube/youtube-music-rank"
import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { searchSongs } from "@/lib/youtube-search"

export type { YouTubeMusicHit }

function inferOfficialAudio(hit: { title: string; channel: string }): boolean {
  return /\s-\sTopic$/i.test(hit.channel) || /\b(audio|official audio)\b/i.test(hit.title)
}

async function searchViaWorker(
  artist: string,
  track: string,
  options?: { durationSec?: number; limit?: number; signal?: AbortSignal },
): Promise<YouTubeMusicHit[]> {
  const params = new URLSearchParams({ artist, track })
  if (options?.durationSec) params.set("durationSec", String(Math.round(options.durationSec)))
  if (options?.limit) params.set("limit", String(options.limit))

  const res = await proxyFetch(`/api/youtube/music-search?${params}`, {
    signal: options?.signal,
  })
  if (!res.ok) throw new Error("youtube_music_search_failed")
  const data = (await res.json()) as { results?: YouTubeMusicHit[] }
  return data.results ?? []
}

async function searchViaFallback(
  artist: string,
  track: string,
  options?: { durationSec?: number; limit?: number; signal?: AbortSignal },
): Promise<YouTubeMusicHit[]> {
  const query = [artist, track, "official audio"].filter(Boolean).join(" ")
  const hits = await searchSongs(query, { limit: options?.limit ?? 8, signal: options?.signal })
  return hits.map((hit) => ({
    ...hit,
    resultType: inferOfficialAudio(hit) ? "song" : "video",
    isOfficialAudio: inferOfficialAudio(hit),
  }))
}

export async function searchYouTubeMusicSongs(
  artist: string,
  track: string,
  options?: { durationSec?: number; limit?: number; signal?: AbortSignal },
): Promise<YouTubeMusicHit[]> {
  const cleanArtist = artist.trim()
  const cleanTrack = track.trim()
  if (!cleanTrack) return []

  let hits: YouTubeMusicHit[]
  try {
    hits = await searchViaWorker(cleanArtist, cleanTrack, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError")
    hits = await searchViaFallback(cleanArtist, cleanTrack, options)
  }

  const best = pickBestYouTubeMusicHit(hits, cleanArtist, cleanTrack, options?.durationSec)
  return best ? [best] : []
}

