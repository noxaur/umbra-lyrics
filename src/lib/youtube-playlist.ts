import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { resolveCanonicalMusicVideo } from "@/lib/canonical-music-video"
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

type PlaylistTrackResolutionOptions = {
  signal?: AbortSignal
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function resolvePlaylistItemMedia(
  item: PlaylistImportItem,
  track: Omit<PlaylistTrack, "addedAt">,
  options?: PlaylistTrackResolutionOptions,
): Promise<Omit<PlaylistTrack, "addedAt">> {
  const canonical = await resolveCanonicalMusicVideo(
    {
      kind: "youtube",
      videoId: item.videoId,
      title: item.title,
      oembedAuthor: item.channel,
      durationSec: item.durationSec ?? undefined,
    },
    options,
  ).catch(() => null)

  if (!canonical?.ok || canonical.videoId === track.videoId) {
    return track
  }

  return normalizeTrackMetadata({
    ...track,
    videoId: canonical.videoId,
    artist: canonical.seedMetadata.artist || track.artist,
    track: canonical.seedMetadata.track || track.track,
    mediaSource: "music.youtube",
  })
}

export async function playlistItemsToCanonicalTracks(
  items: PlaylistImportItem[],
  options?: PlaylistTrackResolutionOptions,
): Promise<Omit<PlaylistTrack, "addedAt">[]> {
  const tracks = playlistItemsToTracks(items)
  return mapWithConcurrency(items, 4, (item, index) =>
    resolvePlaylistItemMedia(item, tracks[index], options),
  )
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
  let emptyWorkerResult: PlaylistImportResponse | null = null

  try {
    const res = await proxyFetch(`/api/youtube/playlist?${params}`, {
      signal: options?.signal,
    })

    const body = (await res.json().catch(() => null)) as
      | (PlaylistImportResponse & { error?: string })
      | null

    if (res.ok) {
      if (body && body.items.length > 0) return body
      emptyWorkerResult = body
      useBrowserFallback = true
    } else if (res.status < 500) {
      throw new Error(body?.error ?? "playlist_fetch_failed")
    } else {
      useBrowserFallback = true
    }
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

  const fromBrowser = await fetchPlaylistInBrowser(playlistId, limit, {
    ...options,
    sourceUrl: input.trim(),
  })
  if (fromBrowser.items.length > 0) return fromBrowser

  if (emptyWorkerResult) {
    throw new Error(
      emptyWorkerResult.totalReported && emptyWorkerResult.totalReported !== "N/A"
        ? "This playlist returned no importable videos. It may be private or require YouTube sign-in."
        : "This playlist has no importable videos",
    )
  }

  return fromBrowser
}
