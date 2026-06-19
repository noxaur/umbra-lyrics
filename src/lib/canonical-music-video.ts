import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import {
  isSessionVariantTitle,
  parseTrackTitle,
  parseTrackTitleCandidates,
  stripDecorativeTitle,
  stripSessionVariantSuffix,
} from "@/lib/parse-track-title"
import { ensureSpotifyAccessToken, spotifyAuthHeaders } from "@/lib/spotify-auth"
import { extractSpotifyTrackId } from "@/lib/spotify-url"
import { resolveTrackMetadata, type ResolvedTrackMetadata } from "@/lib/track-metadata-resolver"
import { fetchYouTubeOEmbed } from "@/lib/youtube-oembed"
import { searchYouTubeMusicSongs } from "@/lib/youtube-music-search"
import {
  MAX_CANONICAL_SCORE,
  scoreYouTubeMusicHit,
  type YouTubeMusicHit,
} from "../../worker/lib/youtube-music-rank"
import type { SeedMetadata } from "@/lib/player-navigation"

export type CanonicalMusicVideoInput =
  | { kind: "spotify"; input: string }
  | {
      kind: "youtube"
      videoId: string
      title?: string
      oembedAuthor?: string | null
      durationSec?: number
    }

export type CanonicalMusicVideoResult =
  | { ok: true; videoId: string; seedMetadata: SeedMetadata }
  | {
      ok: false
      reason:
        | "invalid_url"
        | "spotify_unavailable"
        | "metadata_unconfirmed"
        | "no_youtube_match"
    }

type SpotifyTrackHit = {
  id: string
  name: string
  artist: string
  durationSec: number
  isrc?: string
}

function isApiConfirmed(metadata: ResolvedTrackMetadata): boolean {
  return metadata.source !== "parse" && metadata.source !== "oembed" && metadata.confidence >= 0.5
}

function sourceTitleForCanonicalScoring(rawTitle: string, channel?: string): string {
  const trimmed = rawTitle.trim()
  if (isSessionVariantTitle(trimmed)) return stripDecorativeTitle(trimmed)

  const parsed = parseTrackTitle(trimmed, channel)
  if (parsed.track) {
    return parsed.artist ? `${parsed.artist} - ${parsed.track}` : parsed.track
  }

  return stripDecorativeTitle(trimmed)
}

async function fetchSpotifyTrackById(
  trackId: string,
  signal?: AbortSignal,
): Promise<SpotifyTrackHit | null> {
  const params = new URLSearchParams({ id: trackId })
  const accessToken = await ensureSpotifyAccessToken()
  const res = await proxyFetch(`/api/metadata/spotify/track?${params}`, {
    signal,
    headers: spotifyAuthHeaders(accessToken),
  })
  if (!res.ok) return null

  const data = (await res.json()) as { track?: SpotifyTrackHit }
  return data.track ?? null
}

async function resolveCanonicalFromMetadata(
  metadata: SeedMetadata,
  options?: {
    signal?: AbortSignal
    sourceVideoId?: string
    sourceTitle?: string
    sourceChannel?: string
  },
): Promise<CanonicalMusicVideoResult> {
  const searchTrack = stripSessionVariantSuffix(metadata.track) || metadata.track
  const hits = await searchYouTubeMusicSongs(metadata.artist, searchTrack, {
    durationSec: metadata.durationSec,
    limit: 8,
    signal: options?.signal,
  })
  let best = hits[0]

  if (
    options?.sourceVideoId &&
    best &&
    best.videoId !== options.sourceVideoId &&
    options.sourceTitle?.trim()
  ) {
    const sourceTitle = sourceTitleForCanonicalScoring(
      options.sourceTitle,
      options.sourceChannel?.trim(),
    )
    const sourceHit: YouTubeMusicHit = {
      videoId: options.sourceVideoId,
      title: sourceTitle,
      channel: options.sourceChannel?.trim() ?? "",
      durationSec: metadata.durationSec ?? null,
      resultType: /\s-\sTopic$/i.test(options.sourceChannel ?? "") ? "song" : "video",
      isOfficialAudio: /\s-\sTopic$/i.test(options.sourceChannel ?? ""),
    }
    const sourceScore = scoreYouTubeMusicHit(
      sourceHit,
      metadata.artist,
      searchTrack,
      metadata.durationSec,
    )
    const bestScore = scoreYouTubeMusicHit(best, metadata.artist, searchTrack, metadata.durationSec)
    if (sourceScore <= MAX_CANONICAL_SCORE && sourceScore <= bestScore) {
      best = sourceHit
    }
  }

  if (!best) return { ok: false, reason: "no_youtube_match" }

  return {
    ok: true,
    videoId: best.videoId,
    seedMetadata:
      searchTrack !== metadata.track ? { ...metadata, track: searchTrack } : metadata,
  }
}

async function resolveSpotifyCanonical(
  input: string,
  options?: { signal?: AbortSignal },
): Promise<CanonicalMusicVideoResult> {
  const trackId = extractSpotifyTrackId(input)
  if (!trackId) return { ok: false, reason: "invalid_url" }

  const track = await fetchSpotifyTrackById(trackId, options?.signal)
  if (!track) return { ok: false, reason: "spotify_unavailable" }

  return resolveCanonicalFromMetadata(
    {
      artist: track.artist,
      track: track.name,
      durationSec: track.durationSec,
      isrc: track.isrc,
      source: "spotify",
    },
    options,
  )
}

async function resolveYouTubeCanonical(
  input: Extract<CanonicalMusicVideoInput, { kind: "youtube" }>,
  options?: { signal?: AbortSignal },
): Promise<CanonicalMusicVideoResult> {
  const oembed =
    input.title?.trim() && input.oembedAuthor !== undefined
      ? null
      : await fetchYouTubeOEmbed(input.videoId)
  const title = input.title?.trim() || oembed?.title?.trim() || ""
  const oembedAuthor = input.oembedAuthor ?? oembed?.author_name ?? undefined
  if (!title) return { ok: false, reason: "metadata_unconfirmed" }

  for (const candidate of parseTrackTitleCandidates(title, oembedAuthor ?? undefined)) {
    const resolved = await resolveTrackMetadata({
      title,
      durationSec: input.durationSec,
      oembedAuthor: oembedAuthor ?? undefined,
      roughArtist: candidate.artist,
      roughTrack: candidate.track,
    })

    if (!isApiConfirmed(resolved)) continue

    const canonical = await resolveCanonicalFromMetadata(
      {
        artist: resolved.artist,
        track: resolved.track,
        durationSec: resolved.durationSec ?? input.durationSec,
        isrc: resolved.externalIds?.isrc,
        source: "music-api",
      },
      {
        ...options,
        sourceVideoId: input.videoId,
        sourceTitle: title,
        sourceChannel: oembedAuthor,
      },
    )
    if (canonical.ok) return canonical
  }

  return { ok: false, reason: "metadata_unconfirmed" }
}

export function shouldSkipCanonicalResolve(videoId: string, checkedId?: string): boolean {
  return checkedId === videoId
}

export async function resolveCanonicalMusicVideo(
  input: CanonicalMusicVideoInput,
  options?: { signal?: AbortSignal },
): Promise<CanonicalMusicVideoResult> {
  if (input.kind === "spotify") return resolveSpotifyCanonical(input.input, options)
  return resolveYouTubeCanonical(input, options)
}

