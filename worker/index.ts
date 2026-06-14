import { handleApiRequest } from "./router"

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiResponse = await handleApiRequest(request)
    if (apiResponse) return apiResponse

    return env.ASSETS.fetch(request)
  },
}
