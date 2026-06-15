import { jsonResponse } from "../cors"

const USER_AGENT = "song-kara/1.0.0 (https://github.com/song-kara)"
const LIBRETRANSLATE_URL = "https://libretranslate.com/translate"
const MYMEMORY_URL = "https://api.mymemory.translated.net/get"
const GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"

type LibreTranslateBody = {
  q?: string
  source?: string
  target?: string
}

export async function handleLibreTranslate(body: LibreTranslateBody): Promise<Response> {
  const q = body.q?.trim()
  const source = body.source?.trim() || "auto"
  const target = body.target?.trim() || "en"

  if (!q) return jsonResponse({ error: "Missing text" }, 400)

  try {
    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ q, source, target, format: "text" }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return jsonResponse({ error: "Translation failed" }, 502)
    }

    const data = (await res.json()) as { translatedText?: string }
    if (!data.translatedText?.trim()) {
      return jsonResponse({ error: "Empty translation" }, 502)
    }

    return jsonResponse({ translatedText: data.translatedText })
  } catch {
    return jsonResponse({ error: "LibreTranslate unavailable" }, 502)
  }
}

export async function handleMyMemory(q: string, langpair: string): Promise<Response> {
  if (!q.trim()) return jsonResponse({ error: "Missing text" }, 400)
  if (!langpair.includes("|")) return jsonResponse({ error: "Invalid langpair" }, 400)

  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(langpair)}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return jsonResponse({ error: "Translation failed" }, 502)

    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number
    }

    const translated = data.responseData?.translatedText?.trim()
    if (!translated || data.responseStatus === 429) {
      return jsonResponse({ error: "Rate limited or empty" }, 502)
    }

    return jsonResponse({ translatedText: translated })
  } catch {
    return jsonResponse({ error: "MyMemory unavailable" }, 502)
  }
}

export async function handleGoogleTranslate(
  q: string,
  sl: string,
  tl: string,
): Promise<Response> {
  if (!q.trim()) return jsonResponse({ error: "Missing text" }, 400)

  const params = new URLSearchParams({
    client: "gtx",
    sl: sl || "auto",
    tl: tl || "en",
    dt: "t",
    q,
  })

  try {
    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return jsonResponse({ error: "Translation failed" }, 502)

    const data = (await res.json()) as unknown
    const segments = Array.isArray(data) ? data[0] : null
    if (!Array.isArray(segments)) {
      return jsonResponse({ error: "Unexpected response" }, 502)
    }

    const translated = segments
      .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : ""))
      .join("")
      .trim()

    if (!translated) return jsonResponse({ error: "Empty translation" }, 502)

    return jsonResponse({ translatedText: translated })
  } catch {
    return jsonResponse({ error: "Google Translate unavailable" }, 502)
  }
}
