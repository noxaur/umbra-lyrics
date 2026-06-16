import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { parseTrackTitle } from "@/lib/parse-track-title"
import {
  MAX_TRACKS_PER_PLAYLIST,
  type PlaylistTrack,
} from "@/lib/playlists"
import { normalizeTrackMetadata } from "@/lib/track-label"
import { extractYouTubePlaylistId } from "@/lib/youtube-url"
import { fetchPlaylistInBrowser } from "@/lib/youtube-playlist-browser"

export type PlaylistImportItem = {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
}

export type PlaylistImportResponse = {
  playlistId: string
  title: string
  items: PlaylistImportItem[]
  truncated: boolean
  totalReported: string | null
}

export function playlistItemsToTracks(
  items: PlaylistImportItem[],
): Omit<PlaylistTrack, "addedAt">[] {
  return items.map((item) => {
    const parsed = parseTrackTitle(item.title, item.channel)
    return normalizeTrackMetadata({
      videoId: item.videoId,
      title: item.title,
      artist: parsed.artist || item.channel,
      track: parsed.track || item.title,
    })
  })
}

export async function fetchYouTubePlaylist(
  input: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<PlaylistImportResponse> {
  const playlistId = extractYouTubePlaylistId(input)
  if (!playlistId) {
    throw new Error("invalid_playlist_url")
  }

  const limit = options?.limit ?? MAX_TRACKS_PER_PLAYLIST

  const params = new URLSearchParams({ id: playlistId, url: input.trim() })
  params.set("limit", String(limit))

  let useBrowserFallback = false

  try {
    const res = await proxyFetch(`/api/youtube/playlist?${params}`, {
      signal: options?.signal,
    })

    const body = (await res.json().catch(() => null)) as
      | (PlaylistImportResponse & { error?: string })
      | null

    if (res.ok) {
      if (body && body.items.length > 0) return body
      throw new Error(
        body?.totalReported && body.totalReported !== "N/A"
          ? "This playlist returned no importable videos. It may be private or require YouTube sign-in."
          : "This playlist has no importable videos",
      )
    }

    if (res.status < 500) {
      throw new Error(body?.error ?? "playlist_fetch_failed")
    }

    useBrowserFallback = true
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }

    const message = err instanceof Error ? err.message : String(err)
    const isNetworkError = /failed to fetch|networkerror/i.test(message)
    if (!isNetworkError && !useBrowserFallback) {
      throw err instanceof Error ? err : new Error(message)
    }

    useBrowserFallback = true
  }

  if (!useBrowserFallback) {
    throw new Error("playlist_fetch_failed")
  }

  return fetchPlaylistInBrowser(playlistId, limit, {
    ...options,
    sourceUrl: input.trim(),
  })
}
