/** Drop scraper noise (ads, embed scripts, nav chrome) before parsing plain lyrics. */
const JUNK_LINE =
  /(?:document\.write|cf_async|clickfuse|adunit_id|function\s*\(|^\s*var\s+\w+\s*=|^\s*\}\)\(\)|\/\* Lyrics\.net|srv\.clickfuse|Math\.random|getElementsByTagName|<script|^\s*\{?\s*$|^\s*\};?\s*$|^PDF$|^Playlist$|cookieconsent|googletag|adsbygoogle)/i

export function isJunkLyricLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 280 && JUNK_LINE.test(trimmed)) return true
  return JUNK_LINE.test(trimmed)
}

export function sanitizeLyricsText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isJunkLyricLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function lyricsTextLooksLikeJunk(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return true
  const junkCount = lines.filter((l) => isJunkLyricLine(l)).length
  return junkCount / lines.length >= 0.25
}
