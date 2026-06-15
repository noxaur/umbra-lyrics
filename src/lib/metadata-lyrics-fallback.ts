import type {
  LyricsOrchestratorResult,
  LyricsSearchAttempt,
  OrchestratorParams,
} from "@/lib/lyrics-orchestrator"
import type { LyricsProviderId } from "@/types/lyrics"
import { pickBestHit } from "@/lib/lyrics-providers/index"
import { lookupMusicBrainzCanonical } from "@/lib/lyrics-providers/musicbrainz-provider"
import { lyricsOvhProvider } from "@/lib/lyrics-providers/lyrics-ovh-provider"
import { megalobizProvider } from "@/lib/lyrics-providers/megalobiz-provider"
import { simplifyTrackName } from "@/lib/parse-track-title"
import type { ProviderSearchParams } from "@/lib/lyrics-providers/types"

function toProviderParams(params: OrchestratorParams): ProviderSearchParams {
  return {
    track: params.track,
    artist: params.artist,
    durationSec: params.durationSec,
    title: params.title,
    oembedAuthor: params.oembedAuthor,
    preferredLanguage: params.preferredLanguage,
  }
}

/**
 * Last-resort lyrics search using MusicBrainz canonical metadata and alternate providers.
 */
export async function tryMetadataLyricsFallback(
  params: OrchestratorParams,
  attempts: LyricsSearchAttempt[],
  providersTried: LyricsProviderId[],
  report: (phase: string) => void,
): Promise<LyricsOrchestratorResult | null> {
  report("Looking up canonical metadata…")

  const track = simplifyTrackName(params.track) || params.track
  const canonicals = await lookupMusicBrainzCanonical(track, params.artist)

  const searchVariants: ProviderSearchParams[] = [
    toProviderParams(params),
    ...canonicals.slice(0, 3).map((c) => ({
      ...toProviderParams(params),
      track: c.track,
      artist: c.artist,
      durationSec: c.durationSec ?? params.durationSec,
    })),
  ]

  if (params.oembedAuthor?.trim()) {
    searchVariants.push({
      ...toProviderParams(params),
      artist: params.oembedAuthor.trim(),
    })
  }

  const seen = new Set<string>()
  const providers = [lyricsOvhProvider, megalobizProvider]

  for (const variant of searchVariants) {
    const key = `${variant.artist}\0${variant.track}`
    if (seen.has(key)) continue
    seen.add(key)

    for (const provider of providers) {
      if (!providersTried.includes(provider.id)) providersTried.push(provider.id)
      report(`${provider.searchPhase} (metadata)`)

      try {
        const candidates = await provider.search(variant)
        const hit = pickBestHit(candidates, variant)
        if (!hit) {
          attempts.push({
            strategy: `metadata_${provider.id}`,
            provider: provider.id,
            result: "empty",
            message: "No matches",
          })
          continue
        }

        attempts.push({
          strategy: `metadata_${provider.id}`,
          provider: provider.id,
          result: "found",
        })

        const lyrics = hit.result
        const synced = Boolean(lyrics.syncedLyrics?.trim())

        return {
          status: "found",
          strategy: `metadata_${provider.id}`,
          providerId: lyrics.providerId,
          attempts,
          providersTried,
          lyrics,
          message: `Found via ${provider.label} (metadata lookup)`,
          matchId: lyrics.id,
          synced,
        }
      } catch (error) {
        attempts.push({
          strategy: `metadata_${provider.id}`,
          provider: provider.id,
          result: "error",
          message: error instanceof Error ? error.message : "Search failed",
        })
      }
    }
  }

  return null
}
