import { assertAllowedUrl } from "./allowlist"
import { fetchHtml } from "./fetch"
import { slugifyAz, slugifyForUrl } from "./html"
import type { LrcFetchResult } from "./types"

const LRCLIB_CLIENT = "song-kara/1.0.0 (https://github.com/song-kara)"

type LrclibSearchHit = {
  id: number
  trackName: string
  artistName: string
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

type LrclibGetResponse = {
  id: number
  trackName: string
  artistName: string
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

const GITHUB_LRC_REPOS = [
  "Plague-holders/Plague-lyrics",
  "nikkuehr/lrc-lyrics",
] as const

function stripLrcTimestamps(lrc: string): string {
  return lrc
    .replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function fetchLrclibSynced(artist: string, track: string): Promise<LrcFetchResult | null> {
  const q = [artist, track].filter(Boolean).join(" ")
  const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`

  const searchRes = await fetch(searchUrl, {
    headers: { "Lrclib-Client": LRCLIB_CLIENT, "User-Agent": LRCLIB_CLIENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!searchRes.ok) return null

  const hits = (await searchRes.json()) as LrclibSearchHit[]
  const match = hits.find(
    (h) =>
      h.syncedLyrics?.trim() &&
      h.trackName.toLowerCase().includes(track.toLowerCase().slice(0, 4)),
  ) ?? hits.find((h) => h.syncedLyrics?.trim())

  if (!match?.syncedLyrics?.trim()) return null

  return {
    source: "lrclib",
    trackName: match.trackName,
    artistName: match.artistName,
    syncedLyrics: match.syncedLyrics,
    plainLyrics: match.plainLyrics ?? stripLrcTimestamps(match.syncedLyrics),
    url: `https://lrclib.net/api/get/${match.id}`,
  }
}

async function fetchLrclibByMetadata(artist: string, track: string): Promise<LrcFetchResult | null> {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`
  const res = await fetch(url, {
    headers: { "Lrclib-Client": LRCLIB_CLIENT, "User-Agent": LRCLIB_CLIENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null

  const data = (await res.json()) as LrclibGetResponse
  if (!data.syncedLyrics?.trim()) return null

  return {
    source: "lrclib",
    trackName: data.trackName,
    artistName: data.artistName,
    syncedLyrics: data.syncedLyrics,
    plainLyrics: data.plainLyrics ?? stripLrcTimestamps(data.syncedLyrics),
    url,
  }
}

function githubLrcCandidates(artist: string, track: string): string[] {
  const variants = [
    `${slugifyForUrl(artist)}/${slugifyForUrl(track)}.lrc`,
    `${slugifyAz(artist)}/${slugifyAz(track)}.lrc`,
    `${slugifyForUrl(track)}.lrc`,
    `${artist}/${track}.lrc`,
  ]

  const urls: string[] = []
  for (const repo of GITHUB_LRC_REPOS) {
    for (const path of variants) {
      urls.push(`https://raw.githubusercontent.com/${repo}/main/${path}`)
      urls.push(`https://raw.githubusercontent.com/${repo}/master/${path}`)
    }
  }
  return urls
}

async function fetchGithubLrc(artist: string, track: string): Promise<LrcFetchResult | null> {
  for (const url of githubLrcCandidates(artist, track)) {
    assertAllowedUrl(url)
    const result = await fetchHtml(url, { timeoutMs: 8_000 })
    if (!result.ok) continue
    const syncedLyrics = result.html.trim()
    if (!syncedLyrics.includes("[") || syncedLyrics.length < 20) continue

    return {
      source: "github-raw",
      trackName: track,
      artistName: artist,
      syncedLyrics,
      plainLyrics: stripLrcTimestamps(syncedLyrics),
      url,
    }
  }
  return null
}

export type LrcSearchParams = {
  artist: string
  track: string
}

export async function fetchSyncedLrc(params: LrcSearchParams): Promise<LrcFetchResult | null> {
  const { artist, track } = params
  if (!track.trim()) return null

  const strategies: Array<() => Promise<LrcFetchResult | null>> = [
    () => fetchLrclibByMetadata(artist, track),
    () => fetchLrclibSynced(artist, track),
    () => fetchGithubLrc(artist, track),
  ]

  for (const run of strategies) {
    try {
      const hit = await run()
      if (hit?.syncedLyrics?.trim()) return hit
    } catch {
      // try next source
    }
  }

  return null
}

/** Megalobiz LRC via injected handler to avoid circular imports in tests. */
export async function fetchMegalobizLrcViaHandler(
  artist: string,
  track: string,
  searchFn: (artist: string, track: string) => Promise<Response>,
): Promise<LrcFetchResult | null> {
  const res = await searchFn(artist, track)
  if (!res.ok) return null
  const data = (await res.json()) as {
    results?: Array<{
      trackName: string
      artistName: string
      syncedLyrics: string
      plainLyrics: string | null
    }>
  }
  const hit = data.results?.find((r) => r.syncedLyrics?.trim())
  if (!hit) return null
  return {
    source: "megalobiz",
    trackName: hit.trackName,
    artistName: hit.artistName,
    syncedLyrics: hit.syncedLyrics,
    plainLyrics: hit.plainLyrics,
  }
}

export async function fetchSyncedLrcWithMegalobiz(
  params: LrcSearchParams,
  megalobizSearch: (artist: string, track: string) => Promise<Response>,
): Promise<LrcFetchResult | null> {
  const direct = await fetchSyncedLrc(params)
  if (direct) return direct

  return fetchMegalobizLrcViaHandler(params.artist, params.track, megalobizSearch)
}
