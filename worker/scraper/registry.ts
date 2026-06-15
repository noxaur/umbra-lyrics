import { azlyricsExtractor } from "./extractors/azlyrics"
import { geniusExtractor } from "./extractors/genius"
import { lyricscomExtractor } from "./extractors/lyricscom"
import { musixmatchExtractor } from "./extractors/musixmatch"
import { animeLyricsExtractor } from "./extractors/anime"
import { dedupeHits, rankHits } from "./rank"
import type { ScraperExtractor, ScraperHit, ScraperSearchParams } from "./types"

export const ALL_SCRAPER_EXTRACTORS: ScraperExtractor[] = [
  geniusExtractor,
  azlyricsExtractor,
  lyricscomExtractor,
  musixmatchExtractor,
  animeLyricsExtractor,
]

export async function searchAllScrapers(params: ScraperSearchParams): Promise<ScraperHit[]> {
  const batches = await Promise.allSettled(
    ALL_SCRAPER_EXTRACTORS.map((extractor) => extractor.search(params)),
  )

  const hits: ScraperHit[] = []
  for (const batch of batches) {
    if (batch.status === "fulfilled") hits.push(...batch.value)
  }

  return rankHits(dedupeHits(hits))
}
