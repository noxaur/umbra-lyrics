import { franc } from "franc-min"

const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fff]/
const HANGUL_RE = /[\uac00-\ud7af]/
const CYRILLIC_RE = /[\u0400-\u04ff]/
const LATIN_EXTENDED_RE = /[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]/i

/** ISO 639-3 (franc) → BCP-47 for Translator API and translation backends. */
const ISO639_3_TO_BCP47: Record<string, string> = {
  eng: "en",
  jpn: "ja",
  kor: "ko",
  cmn: "zh",
  zho: "zh",
  fra: "fr",
  deu: "de",
  spa: "es",
  por: "pt",
  ita: "it",
  rus: "ru",
  ara: "ar",
  hin: "hi",
  tha: "th",
  vie: "vi",
  ind: "id",
  tur: "tr",
  pol: "pl",
  nld: "nl",
  swe: "sv",
  nor: "no",
  dan: "da",
  fin: "fi",
  ces: "cs",
  ell: "el",
  heb: "he",
  ukr: "uk",
  ron: "ro",
  hun: "hu",
  cat: "ca",
  msa: "ms",
  fil: "tl",
}

export function francToBcp47(code: string): string {
  if (!code || code === "und") return "und"
  if (code.length === 2) return code.toLowerCase()
  const mapped = ISO639_3_TO_BCP47[code.toLowerCase()]
  if (mapped) return mapped
  return code.slice(0, 2).toLowerCase()
}

export type LyricsLanguageMeta = {
  title?: string
  artist?: string
  track?: string
  oembedAuthor?: string
  preferredLanguage?: string
}

const NON_ENGLISH_FRANC = new Set(["jpn", "kor", "cmn", "zho", "rus", "ukr", "ara", "hin", "tha", "vie"])
const EUROPEAN_FRANC = new Set([
  "fra",
  "deu",
  "spa",
  "por",
  "ita",
  "nld",
  "swe",
  "nor",
  "dan",
  "fin",
  "ces",
  "pol",
  "ron",
  "hun",
  "cat",
  "glg",
  "eus",
  "slk",
  "slv",
  "hrv",
  "srp",
  "bul",
  "ell",
  "lit",
  "lav",
  "est",
])

const ENGLISH_LYRIC_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "i",
  "you",
  "me",
  "my",
  "your",
  "we",
  "they",
  "he",
  "she",
  "it",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "can",
  "could",
  "not",
  "no",
  "yes",
  "all",
  "this",
  "that",
  "what",
  "when",
  "where",
  "how",
  "why",
  "who",
  "love",
  "heart",
  "world",
  "time",
  "night",
  "day",
  "life",
  "away",
  "never",
  "always",
  "oh",
  "yeah",
  "baby",
  "feel",
  "know",
  "want",
  "need",
  "like",
  "just",
  "so",
  "don't",
  "can't",
  "won't",
])

function hasFrenchMarkers(text: string): boolean {
  return /\b(je|tu|nous|vous|les|des|une|dans|pour|avec|sur|pas|mais|mon|ton|son|ce|cette|et|est|suis)\b/i.test(
    text,
  )
}

function countLatinWords(text: string): number {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).length
}

/** Share of recognizable English lyric vocabulary in Latin-script text. */
export function englishWordRatio(text: string): number {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? []
  if (words.length === 0) return 0
  const hits = words.filter((word) => ENGLISH_LYRIC_WORDS.has(word)).length
  return hits / words.length
}

/** Fraction of lines that substantially overlap between two lyric bodies. */
export function lyricsOverlapRatio(nativeText: string, candidateText: string): number {
  const nativeLines = nativeText
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
  const candidateLines = candidateText
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)

  if (nativeLines.length === 0 || candidateLines.length === 0) return 0

  let matches = 0
  for (const nativeLine of nativeLines) {
    if (
      candidateLines.some(
        (candidateLine) =>
          nativeLine === candidateLine ||
          nativeLine.includes(candidateLine) ||
          candidateLine.includes(nativeLine),
      )
    ) {
      matches++
    }
  }

  return matches / Math.max(nativeLines.length, candidateLines.length)
}

export function detectLanguage(text: string, meta?: LyricsLanguageMeta): string {
  const sample = text.slice(0, 800).trim()
  if (!sample) {
    return meta?.preferredLanguage ?? inferPreferredLanguage(meta) ?? "en"
  }

  if (hasCjkScript(sample)) return "ja"
  if (HANGUL_RE.test(sample)) return "ko"
  if (CYRILLIC_RE.test(sample)) return "ru"

  const preferred = meta?.preferredLanguage ?? inferPreferredLanguage(meta)
  if (preferred && !isEnglish(preferred) && isLatinScriptLyrics(sample)) {
    if (!lyricsLanguageMatchesMetadata(sample, meta ?? {})) {
      return preferred
    }
  }

  const code = franc(sample.slice(0, 500))
  if (code === "und") {
    return preferred ?? "und"
  }
  return francToBcp47(code)
}

/** Whether bilingual English lines should be fetched for these lyrics. */
export function needsEnglishLyrics(text: string, meta?: LyricsLanguageMeta): boolean {
  const sample = text.trim()
  if (!sample) return false

  if (hasCjkScript(sample) || HANGUL_RE.test(sample) || CYRILLIC_RE.test(sample)) {
    return true
  }

  const preferred = meta?.preferredLanguage ?? inferPreferredLanguage(meta)
  const detected = detectLanguage(sample, meta)

  if (preferred && !isEnglish(preferred)) return true
  if (detected === "und") return false
  return !isEnglish(detected)
}

/** True when lyric text is plausibly an English (Latin-script) translation, not CJK native. */
export function looksLikeEnglishLyrics(text: string): boolean {
  const sample = text.slice(0, 2000).trim()
  if (!sample) return false
  if (hasCjkScript(sample) || HANGUL_RE.test(sample) || CYRILLIC_RE.test(sample)) {
    return false
  }
  if (!isLatinScriptLyrics(sample)) return false

  const code = franc(sample.slice(0, 500))
  const words = countLatinWords(sample)
  const ratio = englishWordRatio(sample)

  if (words < 6) {
    if (LATIN_EXTENDED_RE.test(sample) || hasFrenchMarkers(sample)) return false
    if (code === "eng") return true
    if (/^[\x20-\x7E\n\r]+$/.test(sample) && words >= 2 && !NON_ENGLISH_FRANC.has(code)) {
      return true
    }
    if (EUROPEAN_FRANC.has(code) || NON_ENGLISH_FRANC.has(code)) return ratio >= 0.14
    return false
  }

  if (NON_ENGLISH_FRANC.has(code) || EUROPEAN_FRANC.has(code)) {
    if (ratio >= 0.14) return true
    return false
  }
  if (code === "eng") return true

  return ratio >= 0.1
}

/** Source language for machine translation (prefers metadata over noisy franc on romaji). */
export function resolveTranslationSourceLang(text: string, meta?: LyricsLanguageMeta): string {
  const sample = text.trim()
  if (!sample) return meta?.preferredLanguage ?? "und"

  if (hasCjkScript(sample)) return "ja"
  if (HANGUL_RE.test(sample)) return "ko"
  if (CYRILLIC_RE.test(sample)) return "ru"

  const preferred = meta?.preferredLanguage ?? inferPreferredLanguage(meta)
  if (preferred && !isEnglish(preferred)) return preferred

  const detected = detectLanguage(sample, meta)
  return detected === "und" ? preferred ?? "auto" : detected
}

/** BCP-47 / auto code for translation API `source` parameters. */
export function toTranslationSourceCode(code: string): string {
  const normalized = code.trim().toLowerCase()
  if (!normalized || normalized === "und" || normalized === "auto") return "auto"
  const bcp = francToBcp47(normalized)
  if (bcp === "und") return "auto"
  return bcp
}

export function isEnglish(code: string): boolean {
  const normalized = code.toLowerCase()
  return normalized === "en" || normalized === "eng"
}

export function hasCjkScript(text: string): boolean {
  return CJK_RE.test(text)
}

function isLatinScriptLyrics(text: string): boolean {
  const sample = text.slice(0, 800).trim()
  if (!sample) return false
  return !CJK_RE.test(sample) && !HANGUL_RE.test(sample) && !CYRILLIC_RE.test(sample)
}

/** Infer expected lyric language from video metadata (not store defaults). */
export function inferPreferredLanguage(meta?: {
  title?: string
  artist?: string
  track?: string
  oembedAuthor?: string
}): string | undefined {
  if (!meta) return undefined
  const combined = [meta.title, meta.artist, meta.track, meta.oembedAuthor]
    .filter(Boolean)
    .join(" ")
  if (!combined.trim()) return undefined
  if (HANGUL_RE.test(combined)) return "ko"
  if (CJK_RE.test(combined)) return "ja"
  if (CYRILLIC_RE.test(combined)) return "ru"
  return undefined
}

export function lyricsLanguageMatchesMetadata(
  lyricsText: string,
  meta: { title?: string; artist?: string; track?: string; oembedAuthor?: string },
): boolean {
  const preferred = inferPreferredLanguage(meta)
  if (!preferred) return true

  if (preferred === "ja") {
    if (hasCjkScript(lyricsText)) return true
    if (isLatinScriptLyrics(lyricsText)) return false
    return true
  }

  if (preferred === "ko") {
    if (HANGUL_RE.test(lyricsText)) return true
    if (isLatinScriptLyrics(lyricsText)) return false
    return true
  }

  if (preferred === "ru") {
    if (CYRILLIC_RE.test(lyricsText)) return true
    return !isEnglish(detectLanguage(lyricsText))
  }

  const detected = detectLanguage(lyricsText, meta)
  if (detected === preferred) return true
  if (isEnglish(detected) && !isEnglish(preferred)) return false
  return true
}

/** BCP-47 source → MyMemory langpair prefix (e.g. `ja|en`). */
export function toLangPair(source: string, target = "en"): string {
  const src = toTranslationSourceCode(source)
  const tgt = francToBcp47(target)
  if (src === "auto") return `autodetect|${tgt}`
  return `${src}|${tgt}`
}
