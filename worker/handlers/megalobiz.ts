import { jsonResponse } from "../cors"

const MEGALOBIZ_HOST = "https://www.megalobiz.com"
const USER_AGENT = "Mozilla/5.0 (compatible; song-kara/1.0.0)"

type MegalobizHit = {
  id: string
  trackName: string
  artistName: string
  syncedLyrics: string
  plainLyrics: string | null
}

const SEARCH_LINK_RE =
  /<a[^>]+class="entity_name"[^>]+id="(\d+)"[^>]+name="([^"]*)"[^>]+href="([^"]+)"/gi
const LRC_SPAN_RE = /<span id="lrc_\d+_lyrics">([\s\S]*?)<\/span>/i

function decodeHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseTitleArtist(fullName: string): { title: string; artist: string } {
  const by = fullName.split(/\sby\s/i)
  if (by.length === 2) return { title: by[0].trim(), artist: by[1].trim() }
  const dash = fullName.split(/\s-\s/)
  if (dash.length >= 2) {
    return { title: dash[0].trim(), artist: dash.slice(1).join(" - ").trim() }
  }
  return { title: fullName.trim(), artist: "" }
}

function matchesQuery(
  trackName: string,
  artistName: string,
  track: string,
  artist: string,
): boolean {
  const t = trackName.toLowerCase()
  const a = artistName.toLowerCase()
  const wantT = track.toLowerCase()
  const wantA = artist.toLowerCase()
  if (!wantT) return false
  if (!t.includes(wantT) && !wantT.includes(t)) return false
  if (!wantA) return true
  return a.includes(wantA) || wantA.includes(a)
}

async function fetchLrcFromPath(path: string): Promise<string | null> {
  const url = path.startsWith("http") ? path : `${MEGALOBIZ_HOST}${path}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  const html = await res.text()
  const match = LRC_SPAN_RE.exec(html)
  if (!match?.[1]) return null
  return decodeHtml(match[1])
}

export async function handleMegalobizSearch(
  artist: string,
  track: string,
): Promise<Response> {
  const qry = [artist, track].filter(Boolean).join("-")
  const searchUrl = `${MEGALOBIZ_HOST}/search/all?qry=${encodeURIComponent(qry)}`

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return jsonResponse({ results: [] })

    const html = await res.text()
    const links: Array<{ id: string; fullName: string; path: string }> = []
    for (const match of html.matchAll(SEARCH_LINK_RE)) {
      links.push({ id: match[1], fullName: match[2], path: match[3] })
    }

    const results: MegalobizHit[] = []
    for (const link of links.slice(0, 5)) {
      const { title, artist: parsedArtist } = parseTitleArtist(link.fullName)
      if (!matchesQuery(title, parsedArtist, track, artist)) continue

      const syncedLyrics = await fetchLrcFromPath(link.path)
      if (!syncedLyrics) continue

      results.push({
        id: link.id,
        trackName: title,
        artistName: parsedArtist || artist,
        syncedLyrics,
        plainLyrics: syncedLyrics.replace(/\[\d{2}:\d{2}(?:\.\d{2})?\]/g, "").trim() || null,
      })
    }

    return jsonResponse({ results })
  } catch {
    return jsonResponse({ results: [] })
  }
}
