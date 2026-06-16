import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { toLangPair, toTranslationSourceCode } from "@/lib/language-service"
import {
  canRequestTranslation,
  getTranslationCache,
  markTranslationRequested,
  setTranslationCache,
} from "@/lib/translation-cache"

export type TranslationBackend = "browser" | "libretranslate" | "mymemory" | "google"

export const TRANSLATION_BACKEND_ORDER: TranslationBackend[] = [
  "browser",
  "google",
  "mymemory",
  "libretranslate",
]

export type TranslateLinesResult = {
  lines: string[]
  backend: TranslationBackend
  fromCache: boolean
}

type TranslatorInstance = {
  translate: (text: string) => Promise<string>
}

/** Unlikely to appear in song lyrics; keeps line boundaries through bulk APIs. */
export const LINE_BREAK_SENTINEL = "\n[[[SONG_KARA_LINE]]]\n"
const SENTINEL_SPLIT_RE = /\[\[\[SONG_KARA_LINE\]\]\]/

async function browserTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  if (!window.Translator) return null
  const source = toTranslationSourceCode(sourceLang)
  if (source === "en" || source === "auto") return null

  try {
    const status = await window.Translator.availability({
      sourceLanguage: source,
      targetLanguage: "en",
    })
    if (status !== "available") return null

    const translator: TranslatorInstance = await window.Translator.create({
      sourceLanguage: source,
      targetLanguage: "en",
    })

    const results: string[] = []
    for (const line of lines) {
      results.push(line ? await translator.translate(line) : "")
    }
    return results
  } catch {
    return null
  }
}

async function translateGoogleLine(line: string, sourceLang: string): Promise<string | null> {
  if (!line.trim()) return ""
  const q = new URLSearchParams({
    q: line,
    sl: toTranslationSourceCode(sourceLang),
    tl: "en",
  })
  const res = await proxyFetch(`/api/translate/google?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  return data.translatedText?.trim() ?? null
}

async function translateMyMemoryLine(line: string, sourceLang: string): Promise<string | null> {
  if (!line.trim()) return ""
  const langpair = toLangPair(sourceLang, "en")
  const q = new URLSearchParams({ q: line, langpair })
  const res = await proxyFetch(`/api/translate/mymemory?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  return data.translatedText?.trim() ?? null
}

async function translateLinesIndividually(
  lines: string[],
  sourceLang: string,
  translateLine: (line: string, sourceLang: string) => Promise<string | null>,
): Promise<string[] | null> {
  const results: string[] = []
  for (const line of lines) {
    const translated = await translateLine(line, sourceLang)
    if (translated == null) return null
    results.push(translated)
  }
  return results
}

function splitTranslatedLines(translated: string, expectedCount: number): string[] | null {
  if (translated.includes("[[[SONG_KARA_LINE]]]")) {
    const sentinelParts = translated.split(SENTINEL_SPLIT_RE).map((part) => part.trim())
    if (sentinelParts.length === expectedCount) return sentinelParts
  }

  const newlineParts = translated.split("\n").map((part) => part.trim())
  if (newlineParts.length === expectedCount) return newlineParts

  if (newlineParts.length === 1 && expectedCount > 1) return null

  if (newlineParts.length > expectedCount) {
    return newlineParts.slice(0, expectedCount)
  }

  const padded = [...newlineParts]
  while (padded.length < expectedCount) padded.push("")
  return padded.length === expectedCount ? padded : null
}

async function libreTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join(LINE_BREAK_SENTINEL)
  const res = await proxyFetch("/api/translate/libretranslate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: toTranslationSourceCode(sourceLang),
      target: "en",
    }),
  })
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null

  const split = splitTranslatedLines(translated, lines.length)
  if (split) return split
  return translateLinesIndividually(lines, sourceLang, async (line, lang) => {
    const res = await proxyFetch("/api/translate/libretranslate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: line,
        source: toTranslationSourceCode(lang),
        target: "en",
      }),
    })
    if (!res.ok) return null
    const payload = (await res.json()) as { translatedText?: string }
    return payload.translatedText?.trim() ?? null
  })
}

async function myMemoryTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join(LINE_BREAK_SENTINEL)
  const langpair = toLangPair(sourceLang, "en")
  const q = new URLSearchParams({ q: text, langpair })
  const res = await proxyFetch(`/api/translate/mymemory?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null

  const split = splitTranslatedLines(translated, lines.length)
  if (split) return split
  return translateLinesIndividually(lines, sourceLang, translateMyMemoryLine)
}

async function googleTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join(LINE_BREAK_SENTINEL)
  const q = new URLSearchParams({
    q: text,
    sl: toTranslationSourceCode(sourceLang),
    tl: "en",
  })
  const res = await proxyFetch(`/api/translate/google?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null

  const split = splitTranslatedLines(translated, lines.length)
  if (split) return split
  return translateLinesIndividually(lines, sourceLang, translateGoogleLine)
}

const BACKEND_FN: Record<
  Exclude<TranslationBackend, "browser">,
  (lines: string[], sourceLang: string) => Promise<string[] | null>
> = {
  libretranslate: libreTranslate,
  mymemory: myMemoryTranslate,
  google: googleTranslate,
}

export type TranslateLinesOptions = {
  videoId?: string
  sourceLang: string
  skipCache?: boolean
  backends?: TranslationBackend[]
  /** When true, bypass rate-limit guard (mandatory English pipeline). */
  mandatory?: boolean
}

export async function translateLinesWithFallback(
  lines: string[],
  options: TranslateLinesOptions,
): Promise<TranslateLinesResult | null> {
  const nonEmpty = lines.some((l) => l.trim())
  if (!nonEmpty) return null

  const sourceLang = toTranslationSourceCode(options.sourceLang)
  if (sourceLang === "en") return null

  const videoId = options.videoId ?? ""

  if (!options.skipCache && videoId) {
    const cached = getTranslationCache(videoId, sourceLang, "en")
    if (cached) {
      return { lines: cached.lines, backend: cached.backend, fromCache: true }
    }
  }

  if (videoId && !options.mandatory && !canRequestTranslation(videoId)) {
    return null
  }

  const order = options.backends ?? TRANSLATION_BACKEND_ORDER

  for (const backend of order) {
    let translated: string[] | null = null

    if (backend === "browser") {
      translated = await browserTranslate(lines, options.sourceLang)
    } else {
      translated = await BACKEND_FN[backend](lines, options.sourceLang)
    }

    if (!translated?.some((l) => l.trim())) continue

    if (videoId) markTranslationRequested(videoId)

    if (videoId) {
      setTranslationCache({
        videoId,
        sourceLang,
        targetLang: "en",
        lines: translated,
        backend,
      })
    }

    return { lines: translated, backend, fromCache: false }
  }

  return null
}

declare global {
  interface Window {
    Translator?: {
      create: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<TranslatorInstance>
      availability: (opts: { sourceLanguage: string; targetLanguage: string }) => Promise<string>
    }
  }
}
