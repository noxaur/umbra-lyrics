const PAREN_SUFFIX_RE = /\s*[\(\[][^\)\]]*[\)\]]\s*/g
const FULLWIDTH_BRACKET_RE = /\s*【[^】]*】\s*/g
const FULLWIDTH_PAREN_RE = /\s*（[^）]*）\s*/g
const CORNER_QUOTE_RE = /\s*「[^」]*」\s*/g
const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/

const TRACK_ARTIST_MARKERS =
  /\b(original|official|mv|lyrics|video|live|cover|full ver|anime|audio)\b|歌詞|ミュージックビデオ|作詞|作曲/i

const LEADING_PROMO_RE =
  /^(?:【[^】]*】|「[^」]*」|\([^)]*\)|\[[^\]]*\])+\s*/i

const FEAT_RE =
  /\s*[\(\[]?\s*(?:feat\.?|ft\.?|featuring)\s+[^\)\]]+[\)\]]?\s*$/i
const REMIX_RE =
  /\s*[\(\[]?\s*(?:remix|mix|ver\.?|version|edit|instrumental)\s*[^\)\]]*[\)\]]?\s*$/i

export function stripDecorativeTitle(title: string): string {
  let cleaned = title
    .replace(FULLWIDTH_BRACKET_RE, " ")
    .replace(FULLWIDTH_PAREN_RE, " ")
    .replace(CORNER_QUOTE_RE, " ")
    .replace(PAREN_SUFFIX_RE, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  while (LEADING_PROMO_RE.test(cleaned)) {
    cleaned = cleaned.replace(LEADING_PROMO_RE, "").trim()
  }

  return cleaned
}

export function simplifyTrackName(track: string): string {
  return track.replace(FEAT_RE, "").replace(REMIX_RE, "").replace(/\s+/g, " ").trim()
}

function shouldSwapTrackArtist(left: string, originalTitle: string, separator: string): boolean {
  const sepIndex = originalTitle.indexOf(separator)
  if (sepIndex <= 0) return false

  const prefix = originalTitle.slice(0, sepIndex + left.length)
  return TRACK_ARTIST_MARKERS.test(prefix)
}

function isJapaneseTitlePart(value: string): boolean {
  return CJK_RE.test(value)
}

/** JP YouTube titles often use "曲名 - アーティスト" instead of Western "Artist - Track". */
function shouldSwapForJapanese(left: string, right: string): boolean {
  return isJapaneseTitlePart(left) && isJapaneseTitlePart(right)
}

function normalizeChannelHint(author: string): string {
  return author
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*official$/i, "")
    .trim()
    .toLowerCase()
}

/** Swap when trailing segment matches YouTube channel / oEmbed author name. */
export function shouldSwapForOEmbedAuthor(
  left: string,
  right: string,
  oembedAuthor?: string,
): boolean {
  if (!oembedAuthor?.trim()) return false
  const hint = normalizeChannelHint(oembedAuthor)
  if (!hint) return false
  const rightNorm = right.trim().toLowerCase()
  const leftNorm = left.trim().toLowerCase()
  return rightNorm.includes(hint) || hint.includes(rightNorm) || leftNorm.includes(hint)
}

const TRAILING_PROMO_RE =
  /\s+(?:music\s+video|official\s+video|lyrics?\s+video|mv|amv|mad)\s*$/i

/** `"Song Title" by Artist` — common in Netflix / promo pipe titles. */
function extractQuotedByArtist(title: string): { artist: string; track: string } | null {
  const match = title.match(/"([^"]+)"\s+by\s+(.+)/i)
  if (!match) return null

  const track = simplifyTrackName(match[1].trim())
  let artist = match[2].trim().replace(TRAILING_PROMO_RE, "").trim()
  artist = simplifyTrackName(artist)
  if (!track || !artist) return null
  return { artist, track }
}

/** `Artist "Song Title"` — common in anime AMV titles after a promo prefix. */
function extractArtistQuotedTrack(title: string): { artist: string; track: string } | null {
  const match = title.match(/-\s*([^-]+?)\s+"([^"]+)"\s*$/i)
  if (!match) return null

  const artist = simplifyTrackName(match[1].trim())
  const track = simplifyTrackName(match[2].trim())
  if (!track || !artist) return null
  return { artist, track }
}

function tryPipeSegments(title: string): { artist: string; track: string } | null {
  if (!title.includes("|")) return null

  for (const segment of title.split("|")) {
    const trimmed = segment.trim()
    if (!trimmed) continue

    const quoted =
      extractQuotedByArtist(trimmed) ??
      extractQuotedByArtist(stripDecorativeTitle(trimmed))
    if (quoted) return quoted

    const artistQuoted =
      extractArtistQuotedTrack(trimmed) ??
      extractArtistQuotedTrack(stripDecorativeTitle(trimmed))
    if (artistQuoted) return artistQuoted
  }

  return null
}

function parseSeparatedTitle(
  cleaned: string,
  originalTitle: string,
  oembedAuthor?: string,
): { artist: string; track: string } | null {
  const separators = [" - ", " – ", " — ", ": "]

  for (const sep of separators) {
    const idx = cleaned.indexOf(sep)
    if (idx > 0) {
      let artist = cleaned.slice(0, idx).trim()
      let track = cleaned.slice(idx + sep.length).trim()
      track = simplifyTrackName(track)
      artist = simplifyTrackName(artist)

      if (
        shouldSwapTrackArtist(artist, originalTitle, sep) ||
        shouldSwapForJapanese(artist, track) ||
        shouldSwapForOEmbedAuthor(artist, track, oembedAuthor)
      ) {
        ;[artist, track] = [track, artist]
      }

      return { artist, track }
    }
  }

  return null
}

export function parseTrackTitle(
  title: string,
  oembedAuthor?: string,
): { artist: string; track: string } {
  const fromPipe = tryPipeSegments(title)
  if (fromPipe) return fromPipe

  const cleaned = stripDecorativeTitle(title)

  const fromQuoted =
    extractQuotedByArtist(title) ??
    extractQuotedByArtist(cleaned)
  if (fromQuoted) return fromQuoted

  const fromArtistQuoted =
    extractArtistQuotedTrack(title) ??
    extractArtistQuotedTrack(cleaned)
  if (fromArtistQuoted) return fromArtistQuoted

  const separated = parseSeparatedTitle(cleaned, title, oembedAuthor)
  if (separated) return separated

  return { artist: "", track: simplifyTrackName(cleaned) }
}
