import { jsonResponse } from "../cors"
import { decodeHtml } from "../lib/normalize"

const VAGALUME_BASE = "https://api.vagalume.com.br"
const USER_AGENT = "song-kara/1.0.0"

export type VagalumeHit = {
  id: string
  trackName: string
  artistName: string
  plainLyrics: string
}

type VagalumeResponse = {
  mus?: Array<{
    id?: string
    name?: string
    text?: string
    art?: { name?: string; url?: string }
  }>
}

export function parseVagalumeResponse(data: VagalumeResponse): VagalumeHit[] {
  const results: VagalumeHit[] = []
  for (const song of data.mus ?? []) {
    const lyrics = song.text?.trim()
    if (!lyrics) continue
    results.push({
      id: song.id ?? `${song.art?.name ?? ""}-${song.name ?? ""}`,
      trackName: song.name?.trim() ?? "",
      artistName: song.art?.name?.trim() ?? "",
      plainLyrics: lyrics,
    })
  }
  return results
}

export async function handleVagalumeSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const q = new URLSearchParams({ art: artist, mus: track })
  const url = `${VAGALUME_BASE}/search.php?${q}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return jsonResponse({ results: [] })

    const data = (await res.json()) as VagalumeResponse
    return jsonResponse({ results: parseVagalumeResponse(data) })
  } catch {
    return jsonResponse({ results: [] })
  }
}

export function parseVagalumeHtmlLyrics(html: string): string | null {
  const match = /<div[^>]+id="lyrics"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
  if (!match?.[1]) return null
  return decodeHtml(match[1])
}
