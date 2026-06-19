import { CORS_HEADERS } from "../cors"

const MB_BASE = "https://musicbrainz.org/ws/2"
const MB_USER_AGENT = "umbra/1.0.0 (https://github.com/noxaur/umbra-lyrics)"

export async function handleMusicBrainz(pathname: string, search: string): Promise<Response> {
  const suffix = pathname.slice("/api/lyrics/musicbrainz".length)
  const target = `${MB_BASE}${suffix}${search}`

  try {
    const res = await fetch(target, {
      headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })

    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: "MusicBrainz unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
