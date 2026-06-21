import { CORS_HEADERS } from "../cors"

const LRCLIB_BASE = "https://lrclib.net/api"
const CLIENT_HEADER = "umbra/1.0.0 (https://github.com/noxaur/umbra-lyrics)"

export async function handleLrclib(pathname: string, search: string): Promise<Response> {
  const suffix = pathname.slice("/api/lyrics/lrclib".length)
  const target = `${LRCLIB_BASE}${suffix}${search}`

  try {
    const res = await fetch(target, {
      headers: {
        "Lrclib-Client": CLIENT_HEADER,
        "User-Agent": CLIENT_HEADER,
      },
      // Headroom above typical 10–15s edge latency; client LRCLIB budget is 45s.
      signal: AbortSignal.timeout(20_000),
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
    return new Response(JSON.stringify({ error: "LRCLIB unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
