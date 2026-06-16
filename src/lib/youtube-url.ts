/** YouTube video IDs are always 11 characters: letters, digits, underscore, hyphen. */
export const YOUTUBE_VIDEO_ID_RE = /^[\w-]{11}$/

/** YouTube playlist IDs from the `list` query param (e.g. PL..., OL..., RD...). */
export const YOUTUBE_PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,80}$/

/** Public karaoke share origin (custom domain). */
export const KARAOKE_PUBLIC_ORIGIN = "https://song.opsec.rent"

const YOUTUBE_HOST_RE = /(^|\.)youtube(-nocookie)?\.com$|^youtu\.be$/i
const YOUTUBE_MUSIC_HOST_RE = /(^|\.)music\.youtube\.com$/i
const KARAOKE_HOST_RE = /(^|\.)song\.opsec\.rent$/i

/**
 * Path-based patterns where the video ID appears as a URL segment.
 * Covers watch (v= handled separately), youtu.be, embed, shorts, live, legacy paths.
 */
const YOUTUBE_PATH_PATTERNS = [
  /youtu\.be\/([\w-]{11})/,
  /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
  /youtube\.com\/live\/([\w-]{11})/,
  /youtube\.com\/(?:v|e|vi)\/([\w-]{11})/,
  /music\.youtube\.com\/watch/,
  /youtube\.com\/watch/,
] as const

/** Karaoke app share URLs: song.opsec.rent/play/ID or any host /play/ID (incl. dev). */
const KARAOKE_PLAY_PATTERN = /\/play\/([\w-]{11})(?:[/?#]|$)/

/** YouTube-style karaoke URLs: song.opsec.rent/watch?v=ID or /watch?v=ID */
const KARAOKE_WATCH_PATTERN = /\/watch\?(?:[^#]*&)?v=([\w-]{11})(?:&|#|$)/

function matchPathPatterns(input: string): string | null {
  for (const pattern of YOUTUBE_PATH_PATTERNS) {
    const match = input.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function matchVQueryParam(input: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    const v = url.searchParams.get("v")
    if (!v || !YOUTUBE_VIDEO_ID_RE.test(v)) return null

    if (YOUTUBE_HOST_RE.test(url.hostname)) return v
    if (KARAOKE_HOST_RE.test(url.hostname) && url.pathname === "/watch") return v
  } catch {
    // Not a parseable URL
  }
  return null
}

function matchKaraokeWatchUrl(input: string): string | null {
  const trimmed = input.trim()
  const relative = trimmed.match(/^\/watch\?v=([\w-]{11})/)
  if (relative) return relative[1]

  const match = trimmed.match(KARAOKE_WATCH_PATTERN)
  if (match?.[1]) return match[1]

  return null
}

function matchKaraokePlayUrl(input: string): string | null {
  const trimmed = input.trim()
  const relative = trimmed.match(/^\/play\/([\w-]{11})$/)
  if (relative) return relative[1]

  const match = trimmed.match(KARAOKE_PLAY_PATTERN)
  if (match?.[1]) return match[1]

  return null
}

/**
 * Extract an 11-character YouTube video ID from common share URL formats.
 *
 * Supported YouTube formats:
 * - `youtube.com/watch?v=ID` (with optional `&list=`, `&t=`, `&si=` params)
 * - `youtu.be/ID` (with optional `?si=` sharing param)
 * - `youtube.com/embed/ID`, `youtube-nocookie.com/embed/ID`
 * - `youtube.com/shorts/ID`, `youtube.com/live/ID`
 * - `music.youtube.com/watch?v=ID`, `m.youtube.com/watch?v=ID`
 * - Legacy `youtube.com/v/ID`, `/e/ID`, `/vi/ID`
 * - Bare 11-character video ID
 *
 * Supported karaoke share formats:
 * - `https://song.opsec.rent/play/ID`
 * - `https://song.opsec.rent/watch?v=ID` (YouTube-style; redirects to `/play/ID`)
 * - `/play/ID` (relative, e.g. dev server)
 * - `/watch?v=ID` (relative)
 * - `http://localhost:5173/play/ID`
 */
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const karaokeId = matchKaraokePlayUrl(trimmed)
  if (karaokeId) return karaokeId

  const karaokeWatchId = matchKaraokeWatchUrl(trimmed)
  if (karaokeWatchId) return karaokeWatchId

  const pathId = matchPathPatterns(trimmed)
  if (pathId) return pathId

  const queryId = matchVQueryParam(trimmed)
  if (queryId) return queryId

  if (YOUTUBE_VIDEO_ID_RE.test(trimmed)) return trimmed

  return null
}

export function isYouTubeUrl(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed || YOUTUBE_VIDEO_ID_RE.test(trimmed)) return false
  return (
    /youtube|youtu\.be/i.test(trimmed) &&
    extractYouTubeVideoId(trimmed) !== null &&
    !isKaraokePlayUrl(trimmed)
  )
}

function isYouTubePlaylistHost(hostname: string): boolean {
  return YOUTUBE_HOST_RE.test(hostname) || YOUTUBE_MUSIC_HOST_RE.test(hostname)
}

/**
 * Extract a YouTube playlist ID from common share URL formats.
 *
 * Supported formats:
 * - `youtube.com/playlist?list=PL...`
 * - `music.youtube.com/playlist?list=PL...`
 * - `youtube.com/watch?v=...&list=PL...`
 * - Bare playlist id (e.g. `PLrAXtmRdnEQy6nuLMH...`)
 */
export function extractYouTubePlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (YOUTUBE_PLAYLIST_ID_RE.test(trimmed) && /^[A-Z]{2}/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (!isYouTubePlaylistHost(url.hostname)) return null

    const list = url.searchParams.get("list")?.trim()
    if (list && YOUTUBE_PLAYLIST_ID_RE.test(list)) return list
  } catch {
    // Not a parseable URL
  }

  return null
}

export function isYouTubePlaylistUrl(input: string): boolean {
  return extractYouTubePlaylistId(input) !== null
}

export function isKaraokePlayUrl(input: string): boolean {
  const trimmed = input.trim()
  return (
    /song\.opsec\.rent\/play\//i.test(trimmed) ||
    /^\/play\/[\w-]{11}$/.test(trimmed) ||
    /\/play\/[\w-]{11}(?:[/?#]|$)/.test(trimmed)
  )
}

export function isKaraokeWatchUrl(input: string): boolean {
  const trimmed = input.trim()
  return (
    /song\.opsec\.rent\/watch\?v=/i.test(trimmed) ||
    /^\/watch\?v=[\w-]{11}/.test(trimmed) ||
    KARAOKE_WATCH_PATTERN.test(trimmed)
  )
}

/** YouTube-style share URL on the karaoke domain (redirects to `/play/ID`). */
export function karaokeWatchUrl(
  videoId: string,
  origin: string = KARAOKE_PUBLIC_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/watch?v=${videoId}`
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youTubeMusicWatchUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`
}

/** Build a shareable karaoke player URL on the public custom domain. */
export function karaokePlayUrl(
  videoId: string,
  origin: string = KARAOKE_PUBLIC_ORIGIN,
): string {
  return `${origin.replace(/\/$/, "")}/play/${videoId}`
}

/**
 * Convert any supported YouTube or karaoke URL (or bare video ID) into
 * `https://song.opsec.rent/play/VIDEO_ID`.
 */
export function toKaraokePlayUrl(input: string): string | null {
  const id = extractYouTubeVideoId(input)
  return id ? karaokePlayUrl(id) : null
}
