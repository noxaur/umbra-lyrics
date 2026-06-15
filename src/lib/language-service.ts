import { franc } from "franc-min"

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
  if (!code || code === "und") return "en"
  if (code.length === 2) return code.toLowerCase()
  const mapped = ISO639_3_TO_BCP47[code.toLowerCase()]
  if (mapped) return mapped
  return code.slice(0, 2).toLowerCase()
}

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 500)
  const code = franc(sample)
  return francToBcp47(code === "und" ? "eng" : code)
}

export function isEnglish(code: string): boolean {
  const normalized = code.toLowerCase()
  return normalized === "en" || normalized === "eng"
}

/** BCP-47 source → MyMemory langpair prefix (e.g. `ja|en`). */
export function toLangPair(source: string, target = "en"): string {
  const src = francToBcp47(source)
  const tgt = francToBcp47(target)
  return `${src}|${tgt}`
}
