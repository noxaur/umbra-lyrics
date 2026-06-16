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
import type { LyricsProvider, ProviderSearchParams } from "@/lib/lyrics-providers/types"

function toProviderParams(params: OrchestratorParams): ProviderSearchParams {
  const meta = params.resolvedMetadata
  return {
    track: params.track,
    artist: params.artist,
    durationSec: params.durationSec,
    title: params.title,
    oembedAuthor: params.oembedAuthor,
    preferredLanguage: params.preferredLanguage,
    canonicalArtist: meta?.artist,
    canonicalTrack: meta?.track,
    metadataAlternates: meta?.alternates,
  }
}

const METADATA_PROVIDERS: LyricsProvider[] = [lyricsOvhProvider, megalobizProvider]

const METADATA_PROVIDER_PRIORITY: Record<LyricsProviderId, number> = {
  musixmatch: 0,
  "lyrics-ovh": 1,
  megalobiz: 2,
  lrclib: 99,
  musicbrainz: 99,
  "aggregated-scraper": 99,
  chartlyrics: 99,
  genius: 99,
  petitlyrics: 99,
  lyricstranslate: 99,
  animelyrics: 99,
  vagalume: 99,
  lyricswiki: 99,
  songmeanings: 99,
  letras: 99,
  transcription: 99,
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
  const tasks: Array<() => Promise<{
    result: LyricsOrchestratorResult | null
    attempts: LyricsSearchAttempt[]
  }>> = []

  for (const variant of searchVariants) {
    const key = `${variant.artist}\0${variant.track}`
    if (seen.has(key)) continue
    seen.add(key)

    for (const provider of METADATA_PROVIDERS) {
      tasks.push(async () => {
        const localAttempts: LyricsSearchAttempt[] = []
        if (!providersTried.includes(provider.id)) providersTried.push(provider.id)
        report(`${provider.searchPhase} (metadata)`)

        try {
          const candidates = await provider.search(variant)
          const hit = pickBestHit(candidates, variant)
          if (!hit) {
            localAttempts.push({
              strategy: `metadata_${provider.id}`,
              provider: provider.id,
              result: "empty",
              message: "No matches",
            })
            return { result: null, attempts: localAttempts }
          }

          localAttempts.push({
            strategy: `metadata_${provider.id}`,
            provider: provider.id,
            result: "found",
          })

          const lyrics = hit.result
          const synced = Boolean(lyrics.syncedLyrics?.trim())

          return {
            result: {
              status: "found",
              strategy: `metadata_${provider.id}`,
              providerId: lyrics.providerId,
              attempts: [],
              providersTried,
              lyrics,
              message: `Found via ${provider.label} (metadata lookup)`,
              matchId: lyrics.id,
              synced,
            },
            attempts: localAttempts,
          }
        } catch (error) {
          localAttempts.push({
            strategy: `metadata_${provider.id}`,
            provider: provider.id,
            result: "error",
            message: error instanceof Error ? error.message : "Search failed",
          })
          return { result: null, attempts: localAttempts }
        }
      })
    }
  }

  const outcomes = await Promise.all(tasks.map((task) => task()))
  for (const outcome of outcomes) {
    attempts.push(...outcome.attempts)
  }

  const results = outcomes
    .map((outcome) => outcome.result)
    .filter((result): result is LyricsOrchestratorResult => result != null)

  if (results.length === 0) return null

  results.sort(
    (a, b) =>
      (METADATA_PROVIDER_PRIORITY[a.providerId ?? "lrclib"] ?? 99) -
      (METADATA_PROVIDER_PRIORITY[b.providerId ?? "lrclib"] ?? 99),
  )

  return { ...results[0]!, attempts, providersTried }
}
