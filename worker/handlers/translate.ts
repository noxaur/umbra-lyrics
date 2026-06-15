import { jsonResponse } from "../cors"

const USER_AGENT =
  "Mozilla/5.0 (compatible; song-kara/1.0.0; +https://github.com/song-kara)"
const MYMEMORY_URL = "https://api.mymemory.translated.net/get"
const GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
const DEFAULT_LIBRETRANSLATE_URL = "https://libretranslate.com/translate"

type TranslateEnv = {
  LIBRETRANSLATE_URL?: string
  LIBRETRANSLATE_API_KEY?: string
}

type LibreTranslateBody = {
  q?: string
  source?: string
  target?: string
}

type TranslateErrorBody = {
  error: string
  upstream?: string
  upstreamStatus?: number
  code?: string
}

function translateError(
  body: TranslateErrorBody,
  status: number,
): Response {
  return jsonResponse(body, status)
}

function upstreamHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  }
}

function libreTranslateUrl(env?: TranslateEnv): string {
  return env?.LIBRETRANSLATE_URL?.trim() || DEFAULT_LIBRETRANSLATE_URL
}

export async function handleLibreTranslate(
  body: LibreTranslateBody,
  env: TranslateEnv = {},
): Promise<Response> {
  const q = body.q?.trim()
  const source = body.source?.trim() || "auto"
  const target = body.target?.trim() || "en"

  if (!q) return translateError({ error: "Missing text", code: "bad_request" }, 400)

  const apiKey = env.LIBRETRANSLATE_API_KEY?.trim()
  if (!apiKey) {
    return translateError(
      {
        error: "LibreTranslate API key not configured",
        upstream: "libretranslate",
        code: "upstream_auth",
      },
      503,
    )
  }

  try {
    const res = await fetch(libreTranslateUrl(env), {
      method: "POST",
      headers: {
        ...upstreamHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, source, target, format: "text", api_key: apiKey }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      return translateError(
        {
          error: detail || "LibreTranslate request failed",
          upstream: "libretranslate",
          upstreamStatus: res.status,
          code: res.status === 429 ? "rate_limited" : "upstream_error",
        },
        res.status === 429 ? 429 : 503,
      )
    }

    const data = (await res.json()) as { translatedText?: string }
    if (!data.translatedText?.trim()) {
      return translateError(
        { error: "Empty translation", upstream: "libretranslate", code: "empty_response" },
        502,
      )
    }

    return jsonResponse({ translatedText: data.translatedText })
  } catch {
    return translateError(
      { error: "LibreTranslate unavailable", upstream: "libretranslate", code: "upstream_unreachable" },
      503,
    )
  }
}

export async function handleMyMemory(q: string, langpair: string): Promise<Response> {
  if (!q.trim()) return translateError({ error: "Missing text", code: "bad_request" }, 400)
  if (!langpair.includes("|")) return translateError({ error: "Invalid langpair", code: "bad_request" }, 400)

  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(langpair)}`

  try {
    const res = await fetch(url, {
      headers: {
        ...upstreamHeaders(),
        Referer: "https://song.opsec.rent/",
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return translateError(
        {
          error: "MyMemory request failed",
          upstream: "mymemory",
          upstreamStatus: res.status,
          code: res.status === 429 ? "rate_limited" : "upstream_error",
        },
        res.status === 429 ? 429 : 503,
      )
    }

    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
    }

    if (data.responseStatus === 429) {
      return translateError(
        { error: "MyMemory rate limited", upstream: "mymemory", code: "rate_limited" },
        429,
      )
    }

    const translated = data.responseData?.translatedText?.trim()
    if (!translated) {
      return translateError(
        { error: "Empty translation", upstream: "mymemory", code: "empty_response" },
        502,
      )
    }

    return jsonResponse({ translatedText: translated })
  } catch {
    return translateError(
      { error: "MyMemory unavailable", upstream: "mymemory", code: "upstream_unreachable" },
      503,
    )
  }
}

export async function handleGoogleTranslate(
  q: string,
  sl: string,
  tl: string,
): Promise<Response> {
  if (!q.trim()) return translateError({ error: "Missing text", code: "bad_request" }, 400)

  const params = new URLSearchParams({
    client: "gtx",
    sl: sl || "auto",
    tl: tl || "en",
    dt: "t",
    q,
  })

  try {
    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`, {
      headers: upstreamHeaders(),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return translateError(
        {
          error: "Google Translate request failed",
          upstream: "google",
          upstreamStatus: res.status,
          code: res.status === 429 ? "rate_limited" : "upstream_error",
        },
        res.status === 429 ? 429 : 503,
      )
    }

    const data = (await res.json()) as unknown
    const segments = Array.isArray(data) ? data[0] : null
    if (!Array.isArray(segments)) {
      return translateError(
        { error: "Unexpected Google response", upstream: "google", code: "invalid_response" },
        502,
      )
    }

    const translated = segments
      .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : ""))
      .join("")
      .trim()

    if (!translated) {
      return translateError(
        { error: "Empty translation", upstream: "google", code: "empty_response" },
        502,
      )
    }

    return jsonResponse({ translatedText: translated })
  } catch {
    return translateError(
      { error: "Google Translate unavailable", upstream: "google", code: "upstream_unreachable" },
      503,
    )
  }
}
