import { CORS_HEADERS, jsonResponse } from "../cors"

export async function handleYouTubeOEmbed(videoId: string): Promise<Response> {
  const trimmed = videoId.trim()
  if (!trimmed) return jsonResponse({ error: "Missing videoId" }, 400)

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${trimmed}`,
  )}&format=json`

  try {
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(12_000) })
    const body = await res.text()

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    })
  } catch {
    return jsonResponse({ error: "YouTube oEmbed unavailable" }, 502)
  }
}
