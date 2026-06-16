import { extractSpotifyTrackId } from "@/lib/spotify-url"
import { resolveSpotifyTrackToYouTube, type SpotifyTrackHit } from "@/lib/spotify-to-youtube"
import { extractYouTubeVideoId } from "@/lib/youtube-url"

export type MediaResolveResult =
  | { kind: "youtube"; videoId: string }
  | { kind: "spotify"; videoId: string; track: SpotifyTrackHit }

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
    return { ok: true, result: { kind: "youtube", videoId: youtubeId } }
  }

  const spotifyId = extractSpotifyTrackId(trimmed)
  if (!spotifyId) return null

  const spotify = await resolveSpotifyTrackToYouTube(trimmed, options)
  if (spotify.ok) {
    return {
      ok: true,
      result: { kind: "spotify", videoId: spotify.videoId, track: spotify.track },
    }
  }

  if (spotify.reason === "spotify_unavailable") {
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
