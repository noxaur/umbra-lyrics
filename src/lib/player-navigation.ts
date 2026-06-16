import type { SpotifyTrackHit } from "@/lib/spotify-to-youtube"

export type SeedMetadata = {
  artist: string
  track: string
  durationSec?: number
  isrc?: string
  source: "spotify"
}

export type PlayerNavigationState = {
  fromHome?: boolean
  seedMetadata?: SeedMetadata
}

export function buildPlayerNavigationState(
  fromHome: boolean,
  track?: SpotifyTrackHit,
): PlayerNavigationState {
  const state: PlayerNavigationState = { fromHome }
  if (track) {
    state.seedMetadata = {
      artist: track.artist,
      track: track.name,
      durationSec: track.durationSec,
      isrc: track.isrc,
      source: "spotify",
    }
  }
  return state
}
