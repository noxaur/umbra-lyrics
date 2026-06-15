import { jsonResponse } from "../cors"

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
]

export type StreamFormat = "audio" | "video"

export type ResolvedStream = {
  url: string
  mimeType: string
  itag?: number
}

const VIDEO_ID_PATTERN = /^[\w-]{11}$/

export function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId.trim())
}

async function fetchPipedStreams(videoId: string): Promise<{
  audioStreams: Array<{ url?: string; mimeType?: string; itag?: number }>
  videoStreams: Array<{ url?: string; mimeType?: string; itag?: number }>
} | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as {
        audioStreams?: Array<{ url?: string; mimeType?: string; itag?: number }>
        videoStreams?: Array<{ url?: string; mimeType?: string; itag?: number }>
      }
      if (data.audioStreams?.length || data.videoStreams?.length) {
        return {
          audioStreams: data.audioStreams ?? [],
          videoStreams: data.videoStreams ?? [],
        }
      }
    } catch {
      // try next instance
    }
  }
  return null
}

function pickStream(
  streams: Array<{ url?: string; mimeType?: string; itag?: number }>,
): ResolvedStream | null {
  const withUrl = streams.filter((s) => typeof s.url === "string" && s.url.trim())
  if (withUrl.length === 0) return null
  const best = withUrl[0]
  return {
    url: best.url!.trim(),
    mimeType: best.mimeType ?? "application/octet-stream",
    itag: best.itag,
  }
}

export async function resolveYouTubeStream(
  videoId: string,
  format: StreamFormat,
): Promise<ResolvedStream | null> {
  const data = await fetchPipedStreams(videoId)
  if (!data) return null

  if (format === "audio") {
    return pickStream(data.audioStreams)
  }

  const videoOnly = data.videoStreams.filter((s) => {
    const mime = s.mimeType ?? ""
    return !mime.startsWith("audio/")
  })
  return pickStream(videoOnly.length > 0 ? videoOnly : data.videoStreams)
}

export async function handleYouTubeStreamInfo(
  videoId: string,
  format: StreamFormat,
  requestUrl: URL,
): Promise<Response> {
  const trimmed = videoId.trim()
  if (!isValidVideoId(trimmed)) {
    return jsonResponse({ error: "Invalid videoId" }, 400)
  }

  const resolved = await resolveYouTubeStream(trimmed, format)
  if (!resolved) {
    return jsonResponse({ error: "Stream unavailable" }, 502)
  }

  const proxyUrl = new URL("/api/beta/youtube/proxy", requestUrl.origin)
  proxyUrl.searchParams.set("videoId", trimmed)
  proxyUrl.searchParams.set("format", format)

  return jsonResponse({
    mimeType: resolved.mimeType,
    streamUrl: `${proxyUrl.pathname}${proxyUrl.search}`,
    format,
  })
}

export async function handleYouTubeStreamProxy(
  videoId: string,
  format: StreamFormat,
  request: Request,
): Promise<Response> {
  const trimmed = videoId.trim()
  if (!isValidVideoId(trimmed)) {
    return jsonResponse({ error: "Invalid videoId" }, 400)
  }

  const resolved = await resolveYouTubeStream(trimmed, format)
  if (!resolved) {
    return jsonResponse({ error: "Stream unavailable" }, 502)
  }

  const upstreamHeaders = new Headers()
  const range = request.headers.get("Range")
  if (range) upstreamHeaders.set("Range", range)
  upstreamHeaders.set("Accept", "*/*")

  try {
    const upstream = await fetch(resolved.url, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(120_000),
    })

    const headers = new Headers()
    const passThrough = [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ] as const

    for (const key of passThrough) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", resolved.mimeType)
    }

    headers.set("Access-Control-Allow-Origin", "*")
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch {
    return jsonResponse({ error: "Stream proxy failed" }, 502)
  }
}
