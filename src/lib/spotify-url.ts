/** Spotify track IDs are 22-character base62 strings. */
export const SPOTIFY_TRACK_ID_RE = /^[A-Za-z0-9]{22}$/

const SPOTIFY_HOST_RE = /(^|\.)spotify\.com$/i

/** Path-based track URLs: open.spotify.com/track/ID or intl-xx/track/ID */
const SPOTIFY_TRACK_PATH_PATTERN = /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/

/** Spotify URI: spotify:track:ID */
const SPOTIFY_TRACK_URI_PATTERN = /^spotify:track:([A-Za-z0-9]{22})$/i

function matchSpotifyTrackPath(input: string): string | null {
  const match = input.match(SPOTIFY_TRACK_PATH_PATTERN)
  return match?.[1] ?? null
}

function matchSpotifyTrackUri(input: string): string | null {
  const match = input.trim().match(SPOTIFY_TRACK_URI_PATTERN)
  return match?.[1] ?? null
}

function matchSpotifyTrackUrl(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    if (!SPOTIFY_HOST_RE.test(url.hostname)) return null
    return matchSpotifyTrackPath(url.pathname + url.search)
  } catch {
    return null
  }
}

/**
 * Extract a Spotify track ID from common share URL formats.
 *
 * Supported formats:
 * - `https://open.spotify.com/track/ID`
 * - `https://open.spotify.com/intl-xx/track/ID` (localized paths)
 * - `https://open.spotify.com/track/ID?si=...` (with sharing params)
 * - `spotify:track:ID`
 * - Bare 22-character track ID
 */
export function extractSpotifyTrackId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const uriId = matchSpotifyTrackUri(trimmed)
  if (uriId) return uriId

  const urlId = matchSpotifyTrackUrl(trimmed)
  if (urlId) return urlId

  const pathId = matchSpotifyTrackPath(trimmed)
  if (pathId) return pathId

  if (SPOTIFY_TRACK_ID_RE.test(trimmed)) return trimmed

  return null
}

export function isSpotifyTrackUrl(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed || SPOTIFY_TRACK_ID_RE.test(trimmed)) return false
  return extractSpotifyTrackId(trimmed) !== null
}
