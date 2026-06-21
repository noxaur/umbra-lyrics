import { jsonResponse } from "../cors"

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
const SPOTIFY_API = "https://api.spotify.com/v1"
export const SPOTIFY_USER_SCOPES = "user-read-private user-read-email"

type SpotifyAuthEnv = {
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

function getClientCredentials(env: SpotifyAuthEnv): { clientId: string; clientSecret: string } | null {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

async function exchangeToken(
  body: URLSearchParams,
  env: SpotifyAuthEnv,
): Promise<TokenResponse | null> {
  const creds = getClientCredentials(env)
  if (!creds) return null

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  const data = (await res.json()) as TokenResponse
  if (!res.ok) return data
  return data
}

export function handleSpotifyAuthConfig(env: SpotifyAuthEnv): Response {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim()
  if (!clientId) {
    return jsonResponse({ error: "Spotify not configured" }, 503)
  }

  return jsonResponse({
    clientId,
    scopes: SPOTIFY_USER_SCOPES,
    authorizeUrl: SPOTIFY_AUTH_URL,
  })
}

export async function handleSpotifyAuthToken(
  request: Request,
  env: SpotifyAuthEnv,
): Promise<Response> {
  if (!getClientCredentials(env)) {
    return jsonResponse({ error: "Spotify not configured" }, 503)
  }

  let payload: { code?: string; code_verifier?: string; redirect_uri?: string }
  try {
    payload = (await request.json()) as typeof payload
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const code = payload.code?.trim()
  const codeVerifier = payload.code_verifier?.trim()
  const redirectUri = payload.redirect_uri?.trim()
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ error: "Missing code, code_verifier, or redirect_uri" }, 400)
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  try {
    const data = await exchangeToken(body, env)
    if (!data?.access_token) {
      return jsonResponse(
        { error: data?.error_description ?? data?.error ?? "Token exchange failed" },
        502,
      )
    }

    return jsonResponse({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? 3600,
      scope: data.scope ?? SPOTIFY_USER_SCOPES,
      tokenType: data.token_type ?? "Bearer",
    })
  } catch {
    return jsonResponse({ error: "Spotify token exchange unavailable" }, 502)
  }
}

export async function handleSpotifyAuthRefresh(
  request: Request,
  env: SpotifyAuthEnv,
): Promise<Response> {
  if (!getClientCredentials(env)) {
    return jsonResponse({ error: "Spotify not configured" }, 503)
  }

  let payload: { refresh_token?: string }
  try {
    payload = (await request.json()) as typeof payload
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const refreshToken = payload.refresh_token?.trim()
  if (!refreshToken) {
    return jsonResponse({ error: "Missing refresh_token" }, 400)
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  try {
    const data = await exchangeToken(body, env)
    if (!data?.access_token) {
      return jsonResponse(
        { error: data?.error_description ?? data?.error ?? "Refresh failed" },
        502,
      )
    }

    return jsonResponse({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresIn: data.expires_in ?? 3600,
      scope: data.scope ?? SPOTIFY_USER_SCOPES,
      tokenType: data.token_type ?? "Bearer",
    })
  } catch {
    return jsonResponse({ error: "Spotify refresh unavailable" }, 502)
  }
}

export async function handleSpotifyAuthMe(request: Request): Promise<Response> {
  const auth = request.headers.get("Authorization")?.trim()
  if (!auth?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing access token" }, 401)
  }

  try {
    const res = await fetch(`${SPOTIFY_API}/me`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      return jsonResponse({ error: "Spotify profile unavailable" }, res.status === 401 ? 401 : 502)
    }

    const profile = (await res.json()) as {
      id?: string
      display_name?: string
      email?: string
      images?: Array<{ url?: string }>
    }

    return jsonResponse({
      id: profile.id ?? "",
      displayName: profile.display_name?.trim() || "Spotify user",
      email: profile.email ?? null,
      imageUrl: profile.images?.[0]?.url ?? null,
    })
  } catch {
    return jsonResponse({ error: "Spotify profile unavailable" }, 502)
  }
}
