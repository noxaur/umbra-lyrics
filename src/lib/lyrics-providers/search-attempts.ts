import { simplifyTrackName } from "@/lib/parse-track-title"
import type { ProviderSearchParams } from "./types"

export function buildSearchAttempts(
  params: ProviderSearchParams,
): Array<{ artist: string; track: string }> {
  return [
    { artist: params.artist, track: params.track },
    { artist: params.artist, track: simplifyTrackName(params.track) },
    { artist: params.oembedAuthor ?? "", track: params.track },
  ].filter((a) => a.track.trim())
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
