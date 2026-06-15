import { decodeHtml } from "./html"
import { sanitizeLyricsText } from "./sanitize-lyrics"

/** Decode HTML entities and remove scraper junk before returning lyrics. */
export function prepareLyricsText(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const cleaned = sanitizeLyricsText(decodeHtml(raw))
  return cleaned || null
}

export function prepareScraperHitLyrics(hit: {
  plainLyrics: string | null
  syncedLyrics: string | null
}): { plainLyrics: string | null; syncedLyrics: string | null } {
  return {
    plainLyrics: prepareLyricsText(hit.plainLyrics),
    syncedLyrics: prepareLyricsText(hit.syncedLyrics),
  }
}
