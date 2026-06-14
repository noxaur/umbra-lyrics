import { corsPreflight, jsonResponse } from "./cors"
import { handleMegalobizSearch } from "./handlers/megalobiz"
import { handleOvhLyrics } from "./handlers/ovh"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return corsPreflight()

    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/lyrics/ovh/")) {
      const parts = url.pathname.slice("/api/lyrics/ovh/".length).split("/")
      const artist = decodeURIComponent(parts[0] ?? "")
      const title = decodeURIComponent(parts.slice(1).join("/"))
      if (!artist.trim() || !title.trim()) {
        return jsonResponse({ error: "Missing artist or title" }, 400)
      }
      return handleOvhLyrics(artist, title)
    }

    if (url.pathname === "/api/lyrics/megalobiz/search") {
      const artist = url.searchParams.get("artist") ?? ""
      const track = url.searchParams.get("track") ?? ""
      if (!track.trim()) return jsonResponse({ error: "Missing track" }, 400)
      return handleMegalobizSearch(artist, track)
    }

    return env.ASSETS.fetch(request)
  },
}
