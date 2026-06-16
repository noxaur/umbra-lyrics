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

export function parseTrackTitle(
  title: string,
  oembedAuthor?: string,
): { artist: string; track: string } {
  const cleaned = stripDecorativeTitle(title)
  const separators = [" - ", " – ", " — ", ": "]

  for (const sep of separators) {
    const idx = cleaned.indexOf(sep)
    if (idx > 0) {
      let artist = cleaned.slice(0, idx).trim()
      let track = cleaned.slice(idx + sep.length).trim()
      track = simplifyTrackName(track)
      artist = simplifyTrackName(artist)

      if (
        shouldSwapTrackArtist(artist, title, sep) ||
        shouldSwapForJapanese(artist, track) ||
        shouldSwapForOEmbedAuthor(artist, track, oembedAuthor)
      ) {
        ;[artist, track] = [track, artist]
      }

      return { artist, track }
    }
  }

  return { artist: "", track: simplifyTrackName(cleaned) }
}
