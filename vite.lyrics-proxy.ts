import type { IncomingMessage, ServerResponse } from "node:http"
import { handleMegalobizSearch } from "./worker/handlers/megalobiz"
import { handleOvhLyrics } from "./worker/handlers/ovh"

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const body = await response.text()
  res.end(body)
}

export function lyricsProxyMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  return (req, res, next) => {
    if (!req.url?.startsWith("/api/lyrics")) return next()

    const url = new URL(req.url, "http://localhost")

    void (async () => {
      if (url.pathname.startsWith("/api/lyrics/ovh/")) {
        const parts = url.pathname.slice("/api/lyrics/ovh/".length).split("/")
        const artist = decodeURIComponent(parts[0] ?? "")
        const title = decodeURIComponent(parts.slice(1).join("/"))
        await sendResponse(res, await handleOvhLyrics(artist, title))
        return
      }

      if (url.pathname === "/api/lyrics/megalobiz/search") {
        const artist = url.searchParams.get("artist") ?? ""
        const track = url.searchParams.get("track") ?? ""
        await sendResponse(res, await handleMegalobizSearch(artist, track))
        return
      }

      next()
    })().catch(() => {
      res.statusCode = 502
      res.end(JSON.stringify({ error: "Lyrics proxy error" }))
    })
  }
}
