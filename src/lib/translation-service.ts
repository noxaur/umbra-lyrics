import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { francToBcp47, toLangPair } from "@/lib/language-service"
import {
  canRequestTranslation,
  getTranslationCache,
  markTranslationRequested,
  setTranslationCache,
} from "@/lib/translation-cache"

export type TranslationBackend = "browser" | "libretranslate" | "mymemory" | "google"

export const TRANSLATION_BACKEND_ORDER: TranslationBackend[] = [
  "browser",
  "libretranslate",
  "mymemory",
  "google",
]

export type TranslateLinesResult = {
  lines: string[]
  backend: TranslationBackend
  fromCache: boolean
}

type TranslatorInstance = {
  translate: (text: string) => Promise<string>
}

async function browserTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  if (!window.Translator) return null
  const source = francToBcp47(sourceLang)
  if (source === "en") return null

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

async function libreTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join("\n")
  const res = await proxyFetch("/api/translate/libretranslate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: francToBcp47(sourceLang),
      target: "en",
    }),
  })
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null
  return splitTranslatedLines(translated, lines.length)
}

async function myMemoryTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join("\n")
  const langpair = toLangPair(sourceLang, "en")
  const q = new URLSearchParams({ q: text, langpair })
  const res = await proxyFetch(`/api/translate/mymemory?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null
  return splitTranslatedLines(translated, lines.length)
}

async function googleTranslate(lines: string[], sourceLang: string): Promise<string[] | null> {
  const text = lines.join("\n")
  const q = new URLSearchParams({
    q: text,
    sl: francToBcp47(sourceLang),
    tl: "en",
  })
  const res = await proxyFetch(`/api/translate/google?${q}`)
  if (!res.ok) return null

  const data = (await res.json()) as { translatedText?: string }
  const translated = data.translatedText?.trim()
  if (!translated) return null
  return splitTranslatedLines(translated, lines.length)
}

function splitTranslatedLines(translated: string, expectedCount: number): string[] {
  const parts = translated.split("\n")
  if (parts.length === expectedCount) return parts

  if (parts.length === 1 && expectedCount > 1) {
    return Array.from({ length: expectedCount }, () => parts[0] ?? "")
  }

  while (parts.length < expectedCount) parts.push("")
  return parts.slice(0, expectedCount)
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
}

export async function translateLinesWithFallback(
  lines: string[],
  options: TranslateLinesOptions,
): Promise<TranslateLinesResult | null> {
  const nonEmpty = lines.some((l) => l.trim())
  if (!nonEmpty) return null

  const sourceLang = francToBcp47(options.sourceLang)
  if (sourceLang === "en") return null

  const videoId = options.videoId ?? ""

  if (!options.skipCache && videoId) {
    const cached = getTranslationCache(videoId, sourceLang, "en")
    if (cached) {
      return { lines: cached.lines, backend: cached.backend, fromCache: true }
    }
  }

  if (videoId && !canRequestTranslation(videoId)) {
    return null
  }

  const order = options.backends ?? TRANSLATION_BACKEND_ORDER

  for (const backend of order) {
    let translated: string[] | null = null

    if (backend === "browser") {
      translated = await browserTranslate(lines, sourceLang)
    } else {
      translated = await BACKEND_FN[backend](lines, sourceLang)
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
