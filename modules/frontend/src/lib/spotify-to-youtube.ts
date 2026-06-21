import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"
import { extractSpotifyTrackId } from "@/lib/spotify-url"

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

export async function resolveSpotifyTrackToYouTube(
  input: string,
  options?: { signal?: AbortSignal },
): Promise<SpotifyResolveResult> {
  const canonical = await resolveCanonicalMusicVideo({ kind: "spotify", input }, options)
  if (canonical.ok) {
    return {
      ok: true,
      videoId: canonical.videoId,
      track: {
        id: extractSpotifyTrackId(input) ?? "",
        name: canonical.seedMetadata.track,
        artist: canonical.seedMetadata.artist,
        durationSec: canonical.seedMetadata.durationSec ?? 0,
        isrc: canonical.seedMetadata.isrc,
      },
    }
  }
  if (canonical.reason === "invalid_url" || canonical.reason === "spotify_unavailable") {
    return { ok: false, reason: canonical.reason }
  }
  return { ok: false, reason: "no_youtube_match" }
}
