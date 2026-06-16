import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { artistMatchScore, trackMatchScore } from "@/lib/lyrics-providers/match-utils"
import { extractSpotifyTrackId } from "@/lib/spotify-url"
import { searchSongs, type SongSearchHit } from "@/lib/youtube-search"

export type SpotifyTrackHit = {
  id: string
  name: string
  artist: string
  durationSec: number
  isrc?: string
}

export type SpotifyResolveResult =
  | { ok: true; videoId: string; track: SpotifyTrackHit }
  | { ok: false; reason: "invalid_url" | "spotify_unavailable" | "no_youtube_match" }

function durationDeltaScore(candidateSec: number | null, targetSec: number): number {
  if (!targetSec || !candidateSec) return 20
  const delta = Math.abs(candidateSec - targetSec)
  if (delta <= 3) return 0
  if (delta <= 10) return 5
  if (delta <= 30) return 15
  return 40
}

function scoreYouTubeHit(hit: SongSearchHit, track: SpotifyTrackHit): number {
  const matchable = {
    artistName: hit.channel,
    trackName: hit.title,
    duration: hit.durationSec ?? undefined,
  }
  let score = durationDeltaScore(hit.durationSec, track.durationSec)
  score += artistMatchScore(matchable, track.artist)
  score += trackMatchScore(matchable, track.name)
  return score
}

function pickBestYouTubeHit(hits: SongSearchHit[], track: SpotifyTrackHit): SongSearchHit | null {
  if (hits.length === 0) return null

  const scored = hits
    .map((hit) => ({ hit, score: scoreYouTubeHit(hit, track) }))
    .sort((a, b) => a.score - b.score)

  return scored[0]?.hit ?? null
}

async function fetchSpotifyTrackById(
  trackId: string,
  signal?: AbortSignal,
): Promise<SpotifyTrackHit | null> {
  const params = new URLSearchParams({ id: trackId })
  const res = await proxyFetch(`/api/metadata/spotify/track?${params}`, { signal })
  if (!res.ok) return null

  const data = (await res.json()) as { track?: SpotifyTrackHit }
  return data.track ?? null
}

export async function resolveSpotifyTrackToYouTube(
  input: string,
  options?: { signal?: AbortSignal },
): Promise<SpotifyResolveResult> {
  const trackId = extractSpotifyTrackId(input)
  if (!trackId) return { ok: false, reason: "invalid_url" }

  const track = await fetchSpotifyTrackById(trackId, options?.signal)
  if (!track) return { ok: false, reason: "spotify_unavailable" }

  const query = [track.artist, track.name].filter(Boolean).join(" ")
  const hits = await searchSongs(query, { limit: 8, signal: options?.signal })
  const best = pickBestYouTubeHit(hits, track)
  if (!best) return { ok: false, reason: "no_youtube_match" }

  return { ok: true, videoId: best.videoId, track }
}
