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

export function decodeHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/** Extract first XML element body (namespace-agnostic). */
export function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, "i")
  const match = re.exec(xml)
  return match?.[1]?.trim() || null
}
