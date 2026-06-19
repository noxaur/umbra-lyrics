import { handleApiRequest } from "./router"
import { httpsRedirect, karaokeWatchRedirect, withSecurityHeaders } from "./headers"
import { jsonResponse } from "./cors"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>
  }
  LIBRETRANSLATE_URL?: string
  LIBRETRANSLATE_API_KEY?: string
  ROMAJI_SERVICE_URL?: string
  ROMAJI_SERVICE_API_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const redirect = httpsRedirect(request)
      if (redirect) return withSecurityHeaders(redirect, true)

      const watchRedirect = karaokeWatchRedirect(request)
      if (watchRedirect) return withSecurityHeaders(watchRedirect)

      const apiResponse = await handleApiRequest(request, env)
      if (apiResponse) return withSecurityHeaders(apiResponse)

      return withSecurityHeaders(await env.ASSETS.fetch(request), true)
    } catch (error) {
      const requestId = request.headers.get("X-Umbra-Request-Id")
      console.error(JSON.stringify({
        level: "error",
        origin: "legacy",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }))
      return withSecurityHeaders(jsonResponse({
        error: "legacy_worker_error",
        origin: "legacy",
        requestId,
      }, 500))
    }
  },
}
