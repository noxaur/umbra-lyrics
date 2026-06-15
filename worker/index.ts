import { handleApiRequest } from "./router"
import { httpsRedirect, karaokeWatchRedirect, withSecurityHeaders } from "./headers"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  LIBRETRANSLATE_URL?: string
  LIBRETRANSLATE_API_KEY?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const redirect = httpsRedirect(request)
    if (redirect) return withSecurityHeaders(redirect, true)

    const watchRedirect = karaokeWatchRedirect(request)
    if (watchRedirect) return withSecurityHeaders(watchRedirect)

    const apiResponse = await handleApiRequest(request, env)
    if (apiResponse) return withSecurityHeaders(apiResponse)

    return withSecurityHeaders(await env.ASSETS.fetch(request), true)
  },
}
