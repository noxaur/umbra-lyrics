import { corsPreflight, jsonResponse } from "./cors"
import { handleAnimeLyricsSearch } from "./handlers/animelyrics"
import { handleChartLyricsSearch } from "./handlers/chartlyrics"
import { handleGeniusSearch } from "./handlers/genius"
import { handleLetrasSearch } from "./handlers/letras"
import { handleLrclib } from "./handlers/lrclib"
import { handleLyricsLrc } from "./handlers/lyrics-lrc"
import { handleLyricsSearch } from "./handlers/lyrics-search"
import { handleLyricsTranslateSearch } from "./handlers/lyricstranslate"
import { handleLyricsWikiSearch } from "./handlers/lyricswiki"
import { handleMegalobizSearch } from "./handlers/megalobiz"
import { handleMusicBrainz } from "./handlers/musicbrainz"
import { handleOvhLyrics } from "./handlers/ovh"
import { handlePetitLyricsSearch } from "./handlers/petitlyrics"
import { handleSongMeaningsSearch } from "./handlers/songmeanings"
import { handleVagalumeSearch } from "./handlers/vagalume"
import { handleYouTubeOEmbed } from "./handlers/youtube-oembed"
import {
  handleGoogleTranslate,
  handleLibreTranslate,
  handleMyMemory,
} from "./handlers/translate"
import { handleYouTubeStreamInfo, handleYouTubeStreamProxy } from "./handlers/youtube-stream"

function proxySearchRoute(
  pathname: string,
  prefix: string,
  handler: (artist: string, track: string) => Promise<Response>,
  url: URL,
): Promise<Response | null> {
  if (pathname !== prefix) return Promise.resolve(null)
  const artist = url.searchParams.get("artist") ?? ""
  const track = url.searchParams.get("track") ?? ""
  if (!track.trim()) return Promise.resolve(jsonResponse({ error: "Missing track" }, 400))
  return handler(artist, track)
}

type ApiEnv = {
  LIBRETRANSLATE_URL?: string
  LIBRETRANSLATE_API_KEY?: string
}

/** Shared API routing for Cloudflare Worker and Vite dev proxy. */
export async function handleApiRequest(
  request: Request,
  env: ApiEnv = {},
): Promise<Response | null> {
  if (request.method === "OPTIONS") return corsPreflight()

  const url = new URL(request.url)
  const { pathname } = url

  if (pathname.startsWith("/api/lyrics/ovh/")) {
    const parts = pathname.slice("/api/lyrics/ovh/".length).split("/")
    const artist = decodeURIComponent(parts[0] ?? "")
    const title = decodeURIComponent(parts.slice(1).join("/"))
    if (!artist.trim() || !title.trim()) {
      return jsonResponse({ error: "Missing artist or title" }, 400)
    }
    return handleOvhLyrics(artist, title)
  }

  if (pathname === "/api/lyrics/search") {
    const q = url.searchParams.get("q") ?? ""
    const artist = url.searchParams.get("artist") ?? ""
    const track = url.searchParams.get("track") ?? ""
    return handleLyricsSearch(q, artist, track)
  }

  if (pathname === "/api/lyrics/lrc") {
    const artist = url.searchParams.get("artist") ?? ""
    const track = url.searchParams.get("track") ?? ""
    return handleLyricsLrc(artist, track)
  }

  if (pathname === "/api/lyrics/megalobiz/search") {
    const artist = url.searchParams.get("artist") ?? ""
    const track = url.searchParams.get("track") ?? ""
    if (!track.trim()) return jsonResponse({ error: "Missing track" }, 400)
    return handleMegalobizSearch(artist, track)
  }

  const proxyRoutes: Array<[string, (artist: string, track: string) => Promise<Response>]> = [
    ["/api/lyrics/chartlyrics/search", handleChartLyricsSearch],
    ["/api/lyrics/vagalume/search", handleVagalumeSearch],
    ["/api/lyrics/genius/search", handleGeniusSearch],
    ["/api/lyrics/lyricstranslate/search", handleLyricsTranslateSearch],
    ["/api/lyrics/animelyrics/search", handleAnimeLyricsSearch],
    ["/api/lyrics/lyricswiki/search", handleLyricsWikiSearch],
    ["/api/lyrics/songmeanings/search", handleSongMeaningsSearch],
    ["/api/lyrics/petitlyrics/search", handlePetitLyricsSearch],
    ["/api/lyrics/letras/search", handleLetrasSearch],
  ]

  for (const [prefix, handler] of proxyRoutes) {
    const match = await proxySearchRoute(pathname, prefix, handler, url)
    if (match) return match
  }

  if (pathname.startsWith("/api/lyrics/lrclib")) {
    return handleLrclib(pathname, url.search)
  }

  if (pathname.startsWith("/api/lyrics/musicbrainz")) {
    return handleMusicBrainz(pathname, url.search)
  }

  if (pathname === "/api/youtube/oembed") {
    const videoId = url.searchParams.get("videoId") ?? ""
    return handleYouTubeOEmbed(videoId)
  }

  if (pathname === "/api/beta/youtube/stream") {
    const videoId = url.searchParams.get("videoId") ?? ""
    const formatParam = url.searchParams.get("format") ?? "audio"
    const format = formatParam === "video" ? "video" : "audio"
    return handleYouTubeStreamInfo(videoId, format, url)
  }

  if (pathname === "/api/beta/youtube/proxy") {
    const videoId = url.searchParams.get("videoId") ?? ""
    const formatParam = url.searchParams.get("format") ?? "audio"
    const format = formatParam === "video" ? "video" : "audio"
    return handleYouTubeStreamProxy(videoId, format, request)
  }

  if (pathname === "/api/translate/libretranslate" && request.method === "POST") {
    try {
      const body = (await request.json()) as { q?: string; source?: string; target?: string }
      return handleLibreTranslate(body, env)
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400)
    }
  }

  if (pathname === "/api/translate/mymemory") {
    const q = url.searchParams.get("q") ?? ""
    const langpair = url.searchParams.get("langpair") ?? ""
    return handleMyMemory(q, langpair)
  }

  if (pathname === "/api/translate/google") {
    const q = url.searchParams.get("q") ?? ""
    const sl = url.searchParams.get("sl") ?? "auto"
    const tl = url.searchParams.get("tl") ?? "en"
    return handleGoogleTranslate(q, sl, tl)
  }

  return null
}
