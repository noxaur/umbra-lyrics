/** Lightweight HTML helpers for Workers (no DOM/cheerio). */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201D",
  ldquo: "\u201C",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
}

const ENHANCED_LRC_TAG = /<\d{2}:\d{2}\.\d{2,3}>/g

function protectEnhancedLrcTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = []
  const protectedText = text.replace(ENHANCED_LRC_TAG, (tag) => {
    const token = `\uE000${tags.length}\uE001`
    tags.push(tag)
    return token
  })
  return { text: protectedText, tags }
}

function restoreEnhancedLrcTags(text: string, tags: string[]): string {
  return text.replace(/\uE000(\d+)\uE001/g, (_, index) => tags[Number(index)] ?? "")
}

export function decodeHtml(text: string): string {
  const { text: protectedText, tags } = protectEnhancedLrcTags(text)

  const decoded = protectedText
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[\uFEFF\u200B\u200C\u200D]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return restoreEnhancedLrcTags(decoded, tags)
}

export function extractFirst(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html)
  return match?.[1]?.trim() ?? null
}

export function extractAll(html: string, pattern: RegExp): string[] {
  const results: string[] = []
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags)
  for (const match of html.matchAll(re)) {
    if (match[1]) results.push(match[1].trim())
  }
  return results
}

export function slugifyForUrl(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim()
}

export function slugifyAz(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

export function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}
