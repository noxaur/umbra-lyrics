const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // YouTube embeds require a Referer; avoid same-origin/no-referrer policies.
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

/** YouTube video IDs are always 11 characters. */
const VIDEO_ID_RE = /^[\w-]{11}$/

/** Required for ffmpeg.wasm SharedArrayBuffer; credentialless keeps third-party embeds working. */
const ISOLATION_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
}

/**
 * Chromium can exempt cross-origin iframes via the iframe `credentialless` attribute.
 * Firefox and Safari enforce document COEP without that escape hatch, which blocks YouTube.
 */
export function isolationHeadersForUserAgent(userAgent: string): Record<string, string> {
  if (/\bfirefox\//i.test(userAgent)) return {}
  if (/applewebkit/i.test(userAgent) && !/chrome|chromium|crios|edg\//i.test(userAgent)) {
    return {}
  }
  return ISOLATION_HEADERS
}

export function withSecurityHeaders(
  response: Response,
  includeIsolation = false,
  userAgent?: string | null,
): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  if (includeIsolation) {
    const isolation =
      userAgent == null || userAgent === ""
        ? ISOLATION_HEADERS
        : isolationHeadersForUserAgent(userAgent)
    for (const [key, value] of Object.entries(isolation)) {
      headers.set(key, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.protocol !== "http:") return null
  if (url.pathname.startsWith("/api/")) return null
  url.protocol = "https:"
  return Response.redirect(url.toString(), 301)
}

/** YouTube-style `/watch?v=VIDEO_ID` → canonical `/play/VIDEO_ID`. */
export function karaokeWatchRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  if (url.pathname !== "/watch") return null

  const videoId = url.searchParams.get("v")?.trim() ?? ""
  if (!VIDEO_ID_RE.test(videoId)) return null

  url.pathname = `/play/${videoId}`
  url.search = ""
  return Response.redirect(url.toString(), 301)
}
