const SUFFIX_RE = /\s*[\(\[][^\)\]]*[\)\]]\s*/g

export function parseTrackTitle(title: string): { artist: string; track: string } {
  const cleaned = title.replace(SUFFIX_RE, " ").replace(/\|/g, " ").trim()
  const separators = [" - ", " – ", " — ", ": "]

  for (const sep of separators) {
    const idx = cleaned.indexOf(sep)
    if (idx > 0) {
      return {
        artist: cleaned.slice(0, idx).trim(),
        track: cleaned.slice(idx + sep.length).trim(),
      }
    }
  }

  return { artist: "", track: cleaned }
}
