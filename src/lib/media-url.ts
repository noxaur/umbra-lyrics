import { extractSpotifyTrackId } from "@/lib/spotify-url"
import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"
import { extractYouTubeVideoId } from "@/lib/youtube-url"
import type { SeedMetadata } from "@/lib/player-navigation"

export type MediaResolveResult =
  | { kind: "youtube"; videoId: string; seedMetadata?: SeedMetadata }
  | { kind: "spotify"; videoId: string; seedMetadata: SeedMetadata }

export type MediaResolveError =
  | { kind: "invalid" }
  | { kind: "spotify_unavailable" }
  | { kind: "no_youtube_match" }

export type MediaInputResult =
  | { ok: true; result: MediaResolveResult }
  | { ok: false; error: MediaResolveError }

export async function resolveMediaInput(
  input: string,
  options?: { signal?: AbortSignal },
): Promise<MediaInputResult | null> {
  const trimmed = input.trim()
  if (!trimmed) return null

  const youtubeId = extractYouTubeVideoId(trimmed)
  if (youtubeId) {
    const canonical = await resolveCanonicalMusicVideo(
      { kind: "youtube", videoId: youtubeId },
      options,
    ).catch(() => null)
    if (canonical?.ok) {
      return {
        ok: true,
        result: {
          kind: "youtube",
          videoId: canonical.videoId,
          seedMetadata: canonical.seedMetadata,
        },
      }
    }
    return { ok: true, result: { kind: "youtube", videoId: youtubeId } }
  }

  const spotifyId = extractSpotifyTrackId(trimmed)
  if (!spotifyId) return null

  const canonical = await resolveCanonicalMusicVideo(
    { kind: "spotify", input: trimmed },
    options,
  ).catch(() => ({ ok: false as const, reason: "spotify_unavailable" as const }))
  if (canonical.ok) {
    return {
      ok: true,
      result: {
        kind: "spotify",
        videoId: canonical.videoId,
        seedMetadata: canonical.seedMetadata,
      },
    }
  }

  if (canonical.reason === "spotify_unavailable") {
    return { ok: false, error: { kind: "spotify_unavailable" } }
  }
  return { ok: false, error: { kind: "no_youtube_match" } }
}

export function mediaResolveErrorMessage(error: MediaResolveError): string {
  switch (error.kind) {
    case "invalid":
      return "Enter a valid YouTube, Spotify track, or song link"
    case "spotify_unavailable":
      return "Spotify lookup failed — try a YouTube link"
    case "no_youtube_match":
      return "Couldn't find this song on YouTube — try searching below"
  }
}
