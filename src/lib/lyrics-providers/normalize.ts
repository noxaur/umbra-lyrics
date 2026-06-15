/** Strip LRC timestamps to plain text lines. */
export function lrcToPlain(lrc: string): string {
  return lrc
    .replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "")
    .replace(/\[\d{2}:\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

import { decodeHtmlEntities } from "@/lib/decode-html-entities"

export function decodeHtml(text: string): string {
  return decodeHtmlEntities(text)
}

/** Extract first XML element body (namespace-agnostic). */
export function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i")
  const match = re.exec(xml)
  return match?.[1]?.trim() || null
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/
const LATIN_EXTENDED_RE = /[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]/i

/** Rough language hint from lyrics text. */
export function detectLanguageHint(text: string): string | undefined {
  const sample = text.slice(0, 500)
  if (CJK_RE.test(sample)) {
    if (/[\u3040-\u30ff]/.test(sample)) return "ja"
    if (/[\uac00-\ud7af]/.test(sample)) return "ko"
    return "zh"
  }
  if (LATIN_EXTENDED_RE.test(sample)) return "es"
  return "en"
}
