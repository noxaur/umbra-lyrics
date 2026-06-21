/** Base URL for proxied APIs (Worker in prod, Vite middleware in dev). Empty = same origin. */
export function lyricsApiBase(): string {
  const fromEnv = import.meta.env.VITE_LYRICS_API_BASE
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.replace(/\/$/, "")
  return ""
}

export async function proxyFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = lyricsApiBase()
  const url = `${base}${path}`
  return fetch(url, init)
}
