import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { parseTrackTitle } from "@/lib/parse-track-title"
import {
  MAX_TRACKS_PER_PLAYLIST,
  type PlaylistTrack,
} from "@/lib/playlists"
import { normalizeTrackMetadata } from "@/lib/track-label"
import { extractYouTubePlaylistId } from "@/lib/youtube-url"

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

  const params = new URLSearchParams({ id: playlistId })
  const limit = options?.limit ?? MAX_TRACKS_PER_PLAYLIST
  params.set("limit", String(limit))

  const res = await proxyFetch(`/api/youtube/playlist?${params}`, {
    signal: options?.signal,
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? "playlist_fetch_failed")
  }

  return (await res.json()) as PlaylistImportResponse
}
