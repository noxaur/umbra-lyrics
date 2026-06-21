import { CORS_HEADERS } from "../cors"

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
const SPOTIFY_API = "https://api.spotify.com/v1"

type SpotifyEnv = {
  SPOTIFY_CLIENT_ID?: string
  SPOTIFY_CLIENT_SECRET?: string
}

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

async function getAccessToken(env: SpotifyEnv): Promise<string | null> {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" })
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return null

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return tokenCache.token
}

export type SpotifyTrackHit = {
  id: string
  name: string
  artist: string
  durationSec: number
  isrc?: string
}

export async function searchSpotifyTracks(
  artist: string,
  track: string,
  env: SpotifyEnv,
): Promise<SpotifyTrackHit[]> {
  const token = await getAccessToken(env)
  if (!token) return []

  const parts = [`track:${track.trim()}`]
  if (artist.trim()) parts.push(`artist:${artist.trim()}`)
  const q = encodeURIComponent(parts.join(" "))
  const res = await fetch(`${SPOTIFY_API}/search?q=${q}&type=track&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return []

  const data = (await res.json()) as {
    tracks?: {
      items?: Array<{
        id?: string
        name?: string
        duration_ms?: number
        external_ids?: { isrc?: string }
        artists?: Array<{ name?: string }>
      }>
    }
  }

  return (data.tracks?.items ?? [])
    .map((item) => mapSpotifyTrackItem(item))
    .filter((hit) => hit.id && hit.name)
}

function mapSpotifyTrackItem(item: {
  id?: string
  name?: string
  duration_ms?: number
  external_ids?: { isrc?: string }
  artists?: Array<{ name?: string }>
}): SpotifyTrackHit {
  return {
    id: item.id ?? "",
    name: item.name?.trim() ?? "",
    artist: item.artists?.[0]?.name?.trim() ?? "",
    durationSec: item.duration_ms ? Math.round(item.duration_ms / 1000) : 0,
    isrc: item.external_ids?.isrc,
  }
}

export async function fetchSpotifyTrack(
  trackId: string,
  env: SpotifyEnv,
  userToken?: string | null,
): Promise<SpotifyTrackHit | null> {
  const token = userToken?.trim() || (await getAccessToken(env))
  if (!token) return null

  const id = trackId.trim()
  if (!id) return null

  const res = await fetch(`${SPOTIFY_API}/tracks/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) return null

  const data = (await res.json()) as {
    id?: string
    name?: string
    duration_ms?: number
    external_ids?: { isrc?: string }
    artists?: Array<{ name?: string }>
  }

  const hit = mapSpotifyTrackItem(data)
  return hit.id && hit.name ? hit : null
}

export async function handleSpotifyTrack(
  trackId: string,
  env: SpotifyEnv,
  userToken?: string | null,
): Promise<Response> {
  if (!trackId.trim()) {
    return new Response(JSON.stringify({ error: "Missing track id", track: null }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }

  try {
    const track = await fetchSpotifyTrack(trackId, env, userToken)
    if (!track) {
      return new Response(JSON.stringify({ error: "Track not found", track: null }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      })
    }
    return new Response(JSON.stringify({ track }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Spotify unavailable", track: null }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}

export async function handleSpotifySearch(
  artist: string,
  track: string,
  env: SpotifyEnv,
): Promise<Response> {
  if (!track.trim()) {
    return new Response(JSON.stringify({ error: "Missing track" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }

  try {
    const hits = await searchSpotifyTracks(artist, track, env)
    return new Response(JSON.stringify({ hits }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Spotify unavailable", hits: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}

/** Reset token cache between tests. */
export function resetSpotifyTokenCacheForTests(): void {
  tokenCache = null
}
