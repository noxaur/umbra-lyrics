/** Hostnames the worker may fetch — client cannot pass arbitrary URLs. */
export const ALLOWED_FETCH_HOSTS = new Set([
  "genius.com",
  "www.genius.com",
  "azlyrics.com",
  "www.azlyrics.com",
  "lyrics.com",
  "www.lyrics.com",
  "search.lyrics.com",
  "musixmatch.com",
  "www.musixmatch.com",
  "animelyrics.com",
  "www.animelyrics.com",
  "lyrical-nonsense.com",
  "www.lyrical-nonsense.com",
  "lrclib.net",
  "www.megalobiz.com",
  "megalobiz.com",
  "raw.githubusercontent.com",
  "api.github.com",
])

export function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return ALLOWED_FETCH_HOSTS.has(host)
  } catch {
    return false
  }
}

export function assertAllowedUrl(url: string): void {
  if (!isAllowedUrl(url)) {
    throw new Error(`Blocked fetch to non-allowlisted host: ${url}`)
  }
}
