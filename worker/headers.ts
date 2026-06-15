const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // YouTube embeds require a Referer; avoid same-origin/no-referrer policies.
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
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
  url.protocol = "https:"
  return Response.redirect(url.toString(), 301)
}
