import { CORS_HEADERS } from "../cors"

const ITUNES_API = "https://itunes.apple.com/search"

export type ItunesTrackHit = {
  id: number
  name: string
  artist: string
  durationSec: number
  isrc?: string
}

export async function searchItunesTracks(term: string): Promise<ItunesTrackHit[]> {
  const query = encodeURIComponent(term.trim())
  if (!query) return []

  const res = await fetch(`${ITUNES_API}?term=${query}&media=music&entity=song&limit=5`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    results?: Array<{
      trackId?: number
      trackName?: string
      artistName?: string
      trackTimeMillis?: number
      isrc?: string
    }>
  }

  return (data.results ?? [])
    .map((item) => ({
      id: item.trackId ?? 0,
      name: item.trackName?.trim() ?? "",
      artist: item.artistName?.trim() ?? "",
      durationSec: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0,
      isrc: item.isrc,
    }))
    .filter((hit) => hit.id && hit.name)
}

export async function handleItunesSearch(term: string): Promise<Response> {
  if (!term.trim()) {
    return new Response(JSON.stringify({ error: "Missing term" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }

  try {
    const hits = await searchItunesTracks(term)
    return new Response(JSON.stringify({ hits }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: "iTunes unavailable", hits: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
