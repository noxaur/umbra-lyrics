import type { ScraperHit, ScraperSearchParams } from "./types"

function textOverlap(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

export function scoreHit(
  hit: Pick<ScraperHit, "trackName" | "artistName" | "plainLyrics" | "syncedLyrics">,
  params: ScraperSearchParams,
  sourcePriority: number,
): number {
  let score = sourcePriority * 10

  if (!hit.plainLyrics?.trim() && !hit.syncedLyrics?.trim()) score += 500

  if (params.track.trim()) {
    if (!textOverlap(hit.trackName, params.track)) score += 80
  }

  if (params.artist.trim()) {
    if (!textOverlap(hit.artistName, params.artist)) score += 60
  }

  if (hit.syncedLyrics?.trim()) score -= 20

  return score
}

export function rankHits(hits: ScraperHit[]): ScraperHit[] {
  return [...hits].sort((a, b) => a.confidence - b.confidence)
}

export function dedupeHits(hits: ScraperHit[]): ScraperHit[] {
  const seen = new Set<string>()
  const out: ScraperHit[] = []
  for (const hit of hits) {
    const key = `${hit.source}\0${hit.url}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(hit)
  }
  return out
}
