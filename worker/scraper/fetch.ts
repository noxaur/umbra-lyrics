import { assertAllowedUrl } from "./allowlist"

const USER_AGENTS = [
  "Mozilla/5.0 (compatible; umbra/1.0.0; +https://github.com/noxaur/umbra-lyrics)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

let uaIndex = 0

export function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length]
  uaIndex += 1
  return ua
}

export type FetchHtmlOptions = {
  timeoutMs?: number
  headers?: Record<string, string>
}

export type FetchHtmlResult =
  | { ok: true; html: string; status: number }
  | { ok: false; error: string; status?: number }

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<FetchHtmlResult> {
  assertAllowedUrl(url)

  const timeoutMs = options.timeoutMs ?? 12_000

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": nextUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status }
    }

    const html = await res.text()
    return { ok: true, html, status: res.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed"
    return { ok: false, error: message }
  }
}

export async function fetchJson<T>(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const result = await fetchHtml(url, options)
  if (!result.ok) return { ok: false, error: result.error }
  try {
    return { ok: true, data: JSON.parse(result.html) as T }
  } catch {
    return { ok: false, error: "invalid JSON" }
  }
}
