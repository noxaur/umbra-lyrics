import type { IncomingMessage, ServerResponse } from "node:http"
import { CORS_HEADERS } from "./worker/cors"
import { handleApiRequest } from "./worker/router"

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
    if (!req.url?.startsWith("/api/")) return next()

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    const url = new URL(req.url, "http://localhost")
    const request = new Request(url.toString(), { method: req.method ?? "GET" })

    void handleApiRequest(request)
      .then(async (response) => {
        if (!response) {
          next()
          return
        }
        await sendResponse(res, response)
      })
      .catch(() => {
        res.writeHead(502, { "Content-Type": "application/json", ...CORS_HEADERS })
        res.end(JSON.stringify({ error: "API proxy error" }))
      })
  }
}
