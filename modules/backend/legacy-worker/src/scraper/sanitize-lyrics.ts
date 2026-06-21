/** Drop scraper noise (ads, embed scripts, nav chrome) before parsing plain lyrics. */
const JUNK_LINE =
  /(?:document\.write|cf_async|clickfuse|adunit_id|function\s*\(|^\s*var\s+\w+\s*=|^\s*\}\)\(\)|\/\* Lyrics\.net|srv\.clickfuse|Math\.random|getElementsByTagName|<script|^\s*\{?\s*$|^\s*\};?\s*$|^PDF$|^Playlist$|cookieconsent|googletag|adsbygoogle|^\d+\s+Contributors(?:Translations)?|Translations(?:Deutsch|English|Türkçe|Español|Português|Français|Polski|Русский|Česky)|Genius\s+Türkçe\s+Çeviriler|^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Lyrics$)/i

/** Genius embeds contributor counts and translation nav inside lyric containers. */
const GENIUS_CONTRIBUTOR_PREFIX =
  /^[\d\s]*Contributors(?:Translations(?:[A-Za-zÀ-ÿ\u0400-\u04ff\u0e00-\u0e7f\u0600-\u06ff]+)*)+/i

export function isJunkLyricLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 280 && JUNK_LINE.test(trimmed)) return true
  return JUNK_LINE.test(trimmed)
}

export function stripGeniusContributorPrefix(text: string): string {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0) return text

  const first = lines[0]?.trim() ?? ""
  if (!GENIUS_CONTRIBUTOR_PREFIX.test(first)) return text

  const strippedFirst = first.replace(GENIUS_CONTRIBUTOR_PREFIX, "").trim()
  if (strippedFirst) {
    return [strippedFirst, ...lines.slice(1)].join("\n").trim()
  }
  return lines.slice(1).join("\n").trim()
}

export function sanitizeLyricsText(text: string): string {
  const withoutGeniusPrefix = stripGeniusContributorPrefix(text)
  return withoutGeniusPrefix
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
