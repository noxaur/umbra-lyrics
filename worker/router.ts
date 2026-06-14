import { corsPreflight, jsonResponse } from "./cors"
import { handleLrclib } from "./handlers/lrclib"
import { handleMegalobizSearch } from "./handlers/megalobiz"
import { handleMusicBrainz } from "./handlers/musicbrainz"
import { handleOvhLyrics } from "./handlers/ovh"
import { handleYouTubeOEmbed } from "./handlers/youtube-oembed"

/** Shared API routing for Cloudflare Worker and Vite dev proxy. */
export async function handleApiRequest(request: Request): Promise<Response | null> {
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

  if (pathname === "/api/lyrics/megalobiz/search") {
    const artist = url.searchParams.get("artist") ?? ""
    const track = url.searchParams.get("track") ?? ""
    if (!track.trim()) return jsonResponse({ error: "Missing track" }, 400)
    return handleMegalobizSearch(artist, track)
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

  return null
}
