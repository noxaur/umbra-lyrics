import type { SpotifyTrackHit } from "@/lib/spotify-to-youtube"

export type SeedMetadata = {
  artist: string
  track: string
  durationSec?: number
  isrc?: string
  source: "spotify" | "music-api" | "youtube-music"
}

export type PlayerNavigationState = {
  fromHome?: boolean
  seedMetadata?: SeedMetadata
  canonicalChecked?: string
  canonicalSourceVideoId?: string
}

export function buildPlayerNavigationState(
  fromHome: boolean,
  track?: SpotifyTrackHit | SeedMetadata,
): PlayerNavigationState {
  const state: PlayerNavigationState = { fromHome }
  if (track) {
    state.seedMetadata =
      "source" in track
        ? track
        : {
            artist: track.artist,
            track: track.name,
            durationSec: track.durationSec,
            isrc: track.isrc,
            source: "spotify",
          }
  }
  return state
}
