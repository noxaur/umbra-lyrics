import { decodeHtmlEntities } from "@/lib/decode-html-entities"
import { sanitizeLyricsText } from "@/lib/sanitize-lyrics"

/** Decode HTML entities and remove scraper junk before parsing lyrics. */
export function prepareLyricsText(raw: string): string {
  return sanitizeLyricsText(decodeHtmlEntities(raw))
}
