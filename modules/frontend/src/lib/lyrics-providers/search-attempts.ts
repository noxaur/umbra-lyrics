import { simplifyTrackName, stripDecorativeTitle } from "@/lib/parse-track-title"
import type { ProviderSearchParams } from "./types"

export function buildSearchAttempts(
  params: ProviderSearchParams,
): Array<{ artist: string; track: string }> {
  const canonicalTrack = params.canonicalTrack ?? params.track
  const strippedTrack = stripDecorativeTitle(canonicalTrack)
  const simplifiedTrack = simplifyTrackName(canonicalTrack)
  const simplifiedStripped = simplifyTrackName(strippedTrack)

  const attempts: Array<{ artist: string; track: string }> = [
    {
      artist: params.canonicalArtist ?? params.artist,
      track: canonicalTrack,
    },
    { artist: params.artist, track: params.track },
    { artist: params.artist, track: strippedTrack },
    { artist: params.artist, track: simplifiedTrack },
    { artist: params.artist, track: simplifiedStripped },
    { artist: params.oembedAuthor ?? "", track: params.track },
    { artist: params.oembedAuthor ?? "", track: simplifiedTrack },
  ]

  for (const alt of params.metadataAlternates ?? []) {
    attempts.push({ artist: alt.artist, track: alt.track })
    attempts.push({ artist: alt.artist, track: stripDecorativeTitle(alt.track) })
    attempts.push({ artist: alt.artist, track: simplifyTrackName(alt.track) })
  }

  return attempts.filter((a) => a.track.trim())
}

export function dedupeAttempts(
  attempts: Array<{ artist: string; track: string }>,
): Array<{ artist: string; track: string }> {
  const seen = new Set<string>()
  const out: Array<{ artist: string; track: string }> = []
  for (const attempt of attempts) {
    const key = `${attempt.artist}\0${attempt.track}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(attempt)
  }
  return out
}
