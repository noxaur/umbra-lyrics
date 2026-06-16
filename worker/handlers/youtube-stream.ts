import { jsonResponse } from "../cors"
import { resolveStreamViaInnertube } from "../lib/youtube-innertube"

export type StreamFormat = "audio" | "video"

export type ResolvedStream = {
  url: string
  mimeType: string
}

const VIDEO_ID_PATTERN = /^[\w-]{11}$/

const ALLOWED_STREAM_HOSTS = [
  "googlevideo.com",
  "youtube.com",
  "ytimg.com",
]

export function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId.trim())
}

export function isAllowedStreamUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl)
    const host = hostname.toLowerCase()
    return ALLOWED_STREAM_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

/** Decode a client-provided stream reference (proxy path or direct googlevideo URL). */
export function decodeStreamReference(streamRef: string): string | null {
  const trimmed = streamRef.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return isAllowedStreamUrl(trimmed) ? trimmed : null
  }

  try {
    const pathAndQuery = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    const url = new URL(pathAndQuery, "https://song.example")
    if (url.pathname !== "/api/beta/youtube/proxy-url") return null
    const encoded = url.searchParams.get("u")
    if (!encoded) return null
    const target = atob(encoded)
    return isAllowedStreamUrl(target) ? target : null
  } catch {
    return null
  }
}

function encodeProxyUrl(targetUrl: string, requestUrl: URL): string {
  const proxy = new URL("/api/beta/youtube/proxy-url", requestUrl.origin)
  proxy.searchParams.set("u", btoa(targetUrl))
  return `${proxy.pathname}${proxy.search}`
}

export async function resolveYouTubeStream(
  videoId: string,
  format: StreamFormat,
): Promise<ResolvedStream | null> {
  const resolved = await resolveStreamViaInnertube(videoId, format)
  if (!resolved) return null
  return { url: resolved.url, mimeType: resolved.mimeType }
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

  return jsonResponse({
    mimeType: resolved.mimeType,
    streamUrl: encodeProxyUrl(resolved.url, requestUrl),
    format,
    source: "innertube",
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

  return proxyStreamUrl(resolved.url, resolved.mimeType, request)
}

export async function handleYouTubeProxyUrl(
  encodedUrl: string,
  request: Request,
): Promise<Response> {
  let targetUrl: string
  try {
    targetUrl = atob(encodedUrl)
  } catch {
    return jsonResponse({ error: "Invalid stream URL encoding" }, 400)
  }

  if (!isAllowedStreamUrl(targetUrl)) {
    return jsonResponse({ error: "Stream host not allowed" }, 403)
  }

  return proxyStreamUrl(targetUrl, undefined, request)
}

async function proxyStreamUrl(
  targetUrl: string,
  mimeType: string | undefined,
  request: Request,
): Promise<Response> {
  const upstreamHeaders = new Headers()
  const range = request.headers.get("Range")
  if (range) upstreamHeaders.set("Range", range)
  upstreamHeaders.set("Accept", "*/*")
  upstreamHeaders.set(
    "User-Agent",
    "com.google.ios.youtube/19.45.4 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
  )

  try {
    const upstream = await fetch(targetUrl, {
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

    if (!headers.has("Content-Type") && mimeType) {
      headers.set("Content-Type", mimeType)
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
