import { proxyFetch } from "@/lib/lyrics-providers/api-base"

const SESSION_KEY = "song-kara:spotify-auth"
const PKCE_KEY = "song-kara:spotify-pkce"
const RETURN_PATH_KEY = "song-kara:spotify-return"
const AUTH_CHANGED_EVENT = "spotify-auth-changed"

export type SpotifySession = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
  scope: string
  displayName: string
  imageUrl: string | null
  userId: string
}

type SpotifyAuthConfig = {
  clientId: string
  scopes: string
  authorizeUrl: string
}

type TokenPayload = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
}

type SpotifyProfile = {
  id: string
  displayName: string
  imageUrl: string | null
}

function notifyAuthChanged(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function generateRandomString(length = 64): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes).slice(0, length)
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return base64UrlEncode(new Uint8Array(digest))
}

function getRedirectUri(): string {
  return `${window.location.origin}/auth/spotify/callback`
}

export function getSpotifySession(): SpotifySession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as SpotifySession
    if (!parsed.accessToken || !parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSpotifySession(): void {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(PKCE_KEY)
  notifyAuthChanged()
}

function saveSpotifySession(session: SpotifySession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  notifyAuthChanged()
}

async function fetchAuthConfig(): Promise<SpotifyAuthConfig> {
  const res = await proxyFetch("/api/auth/spotify/config")
  if (!res.ok) {
    throw new Error("spotify_not_configured")
  }
  return (await res.json()) as SpotifyAuthConfig
}

async function exchangeAuthCode(code: string, codeVerifier: string): Promise<TokenPayload> {
  const res = await proxyFetch("/api/auth/spotify/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: getRedirectUri(),
    }),
  })

  if (!res.ok) {
    throw new Error("spotify_token_exchange_failed")
  }

  const data = (await res.json()) as TokenPayload
  if (!data.accessToken) throw new Error("spotify_token_exchange_failed")
  return data
}

async function refreshAccessToken(refreshToken: string): Promise<TokenPayload> {
  const res = await proxyFetch("/api/auth/spotify/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!res.ok) {
    throw new Error("spotify_refresh_failed")
  }

  const data = (await res.json()) as TokenPayload
  if (!data.accessToken) throw new Error("spotify_refresh_failed")
  return data
}

async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await proxyFetch("/api/auth/spotify/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error("spotify_profile_failed")
  }

  const data = (await res.json()) as {
    id?: string
    displayName?: string
    imageUrl?: string | null
  }

  return {
    id: data.id ?? "",
    displayName: data.displayName?.trim() || "Spotify user",
    imageUrl: data.imageUrl ?? null,
  }
}

async function buildSession(token: TokenPayload, profile?: SpotifyProfile): Promise<SpotifySession> {
  const resolvedProfile = profile ?? (await fetchSpotifyProfile(token.accessToken))
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + token.expiresIn * 1000,
    scope: token.scope,
    displayName: resolvedProfile.displayName,
    imageUrl: resolvedProfile.imageUrl,
    userId: resolvedProfile.id,
  }
}

export async function startSpotifyLogin(returnPath = "/"): Promise<void> {
  const config = await fetchAuthConfig()
  const codeVerifier = generateRandomString(64)
  const state = generateRandomString(16)
  const challenge = await createCodeChallenge(codeVerifier)

  sessionStorage.setItem(
    PKCE_KEY,
    JSON.stringify({ codeVerifier, state, returnPath }),
  )

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: config.scopes,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  })

  window.location.assign(`${config.authorizeUrl}?${params.toString()}`)
}

export async function completeSpotifyLogin(
  code: string,
  state: string,
): Promise<string> {
  const raw = sessionStorage.getItem(PKCE_KEY)
  if (!raw) throw new Error("spotify_pkce_missing")

  const stored = JSON.parse(raw) as {
    codeVerifier?: string
    state?: string
    returnPath?: string
  }

  if (!stored.codeVerifier || stored.state !== state) {
    throw new Error("spotify_state_mismatch")
  }

  const token = await exchangeAuthCode(code, stored.codeVerifier)
  const session = await buildSession(token)
  saveSpotifySession(session)
  sessionStorage.removeItem(PKCE_KEY)

  return stored.returnPath?.startsWith("/") ? stored.returnPath : "/"
}

export async function ensureSpotifyAccessToken(): Promise<string | null> {
  const session = getSpotifySession()
  if (!session) return null

  if (session.expiresAt > Date.now() + 60_000) {
    return session.accessToken
  }

  if (!session.refreshToken) {
    clearSpotifySession()
    return null
  }

  try {
    const token = await refreshAccessToken(session.refreshToken)
    const profile = {
      id: session.userId,
      displayName: session.displayName,
      imageUrl: session.imageUrl,
    }
    const next = await buildSession(token, profile)
    saveSpotifySession(next)
    return next.accessToken
  } catch {
    clearSpotifySession()
    return null
  }
}

export function spotifyAuthHeaders(token: string | null): HeadersInit | undefined {
  if (!token) return undefined
  return { Authorization: `Bearer ${token}` }
}

export function subscribeSpotifyAuth(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(AUTH_CHANGED_EVENT, handler)
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler)
}

export function storeSpotifyReturnPath(path: string): void {
  sessionStorage.setItem(RETURN_PATH_KEY, path)
}

export function consumeSpotifyReturnPath(): string {
  const path = sessionStorage.getItem(RETURN_PATH_KEY)
  sessionStorage.removeItem(RETURN_PATH_KEY)
  return path?.startsWith("/") ? path : "/"
}
