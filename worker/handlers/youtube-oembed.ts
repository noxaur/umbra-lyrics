import { CORS_HEADERS, jsonResponse } from "../cors"
import { youTubeOEmbedApiUrl, youTubeOEmbedWatchUrls } from "../lib/youtube-endpoints"

async function fetchOEmbed(watchUrl: string): Promise<Response> {
  return fetch(youTubeOEmbedApiUrl(watchUrl), { signal: AbortSignal.timeout(12_000) })
}

export async function handleYouTubeOEmbed(videoId: string): Promise<Response> {
  const trimmed = videoId.trim()
  if (!trimmed) return jsonResponse({ error: "Missing videoId" }, 400)

  const watchUrls = youTubeOEmbedWatchUrls(trimmed)

  try {
    for (const watchUrl of watchUrls) {
      const res = await fetchOEmbed(watchUrl)
      if (!res.ok) continue

      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("Content-Type") ?? "application/json",
          ...CORS_HEADERS,
        },
      })
    }

    return jsonResponse({ error: "YouTube oEmbed unavailable" }, 502)
  } catch {
    return jsonResponse({ error: "YouTube oEmbed unavailable" }, 502)
  }
}
