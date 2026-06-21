import { jsonResponse } from "../cors"

const USER_AGENT =
  "Mozilla/5.0 (compatible; umbra/1.0.0; +https://github.com/noxaur/umbra-lyrics)"

export type RomajiEnv = {
  ROMAJI_SERVICE_URL?: string
  ROMAJI_SERVICE_API_KEY?: string
}

export type RomajiBody = {
  lines?: string[]
  system?: "hepburn" | "kunrei" | "nippon" | "nihon"
}

type RomajiErrorBody = {
  error: string
  upstream?: string
  upstreamStatus?: number
  code?: string
}

function romajiError(body: RomajiErrorBody, status: number): Response {
  return jsonResponse(body, status)
}

function serviceBaseUrl(env: RomajiEnv): string | null {
  const url = env.ROMAJI_SERVICE_URL?.trim()
  return url ? url.replace(/\/$/, "") : null
}

export async function handleRomaji(
  body: RomajiBody,
  env: RomajiEnv = {},
): Promise<Response> {
  const lines = body.lines?.filter((line) => typeof line === "string")
  if (!lines?.length) {
    return romajiError({ error: "Missing lines", code: "bad_request" }, 400)
  }
  if (lines.length > 500) {
    return romajiError({ error: "Too many lines", code: "bad_request" }, 400)
  }

  const baseUrl = serviceBaseUrl(env)
  if (!baseUrl) {
    return romajiError(
      {
        error: "Romaji service not configured",
        upstream: "romaji",
        code: "upstream_unconfigured",
      },
      503,
    )
  }

  const apiKey = env.ROMAJI_SERVICE_API_KEY?.trim()
  const system = body.system ?? "hepburn"
  const payload = JSON.stringify({ lines, system })

  try {
    const res = await fetch(`${baseUrl}/romaji`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200)
      return romajiError(
        {
          error: detail || "Romaji service failed",
          upstream: "romaji",
          upstreamStatus: res.status,
          code: res.status === 401 ? "upstream_auth" : "upstream_error",
        },
        res.status >= 500 ? 503 : res.status,
      )
    }

    const data = (await res.json()) as { lines?: string[]; system?: string }
    if (!Array.isArray(data.lines) || data.lines.length !== lines.length) {
      return romajiError(
        {
          error: "Invalid romaji service response",
          upstream: "romaji",
          code: "upstream_invalid",
        },
        502,
      )
    }

    return jsonResponse({
      lines: data.lines,
      system: data.system ?? system,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    return romajiError(
      {
        error: message,
        upstream: "romaji",
        code: "upstream_unreachable",
      },
      503,
    )
  }
}
