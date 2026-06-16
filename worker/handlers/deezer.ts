import { CORS_HEADERS } from "../cors"

const DEEZER_API = "https://api.deezer.com"

export type DeezerTrackHit = {
  id: number
  name: string
  artist: string
  durationSec: number
  isrc?: string
}

export async function searchDeezerTracks(q: string): Promise<DeezerTrackHit[]> {
  const query = encodeURIComponent(q.trim())
  if (!query) return []

  const res = await fetch(`${DEEZER_API}/search?q=${query}&limit=5`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    data?: Array<{
      id?: number
      title?: string
      duration?: number
      isrc?: string
      artist?: { name?: string }
    }>
  }

  return (data.data ?? [])
    .map((item) => ({
      id: item.id ?? 0,
      name: item.title?.trim() ?? "",
      artist: item.artist?.name?.trim() ?? "",
      durationSec: item.duration ?? 0,
      isrc: item.isrc,
    }))
    .filter((hit) => hit.id && hit.name)
}

export async function handleDeezerSearch(q: string): Promise<Response> {
  if (!q.trim()) {
    return new Response(JSON.stringify({ error: "Missing q" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }

  try {
    const hits = await searchDeezerTracks(q)
    return new Response(JSON.stringify({ hits }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Deezer unavailable", hits: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
