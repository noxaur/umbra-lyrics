import {
  mapPlaylistPanelVideo,
  mapPlaylistVideo,
  type PlaylistImportItem,
} from "../../worker/lib/youtube-playlist-map"
import type { PlaylistImportResponse } from "./youtube-playlist"

const memCache: Record<string, ArrayBuffer> = {}

let innertubeModule: typeof import("youtubei.js/web") | null = null

async function loadInnertube() {
  if (!innertubeModule) {
    innertubeModule = await import("youtubei.js/web")
  }
  return innertubeModule
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
}

function normalizePlaylistId(playlistId: string): string {
  const trimmed = playlistId.trim()
  return trimmed.startsWith("VL") ? trimmed.slice(2) : trimmed
}

function isWatchPlaylistUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl)
    return Boolean(url.searchParams.get("v")?.trim() && url.searchParams.get("list")?.trim())
  } catch {
    return false
  }
}

/** Max continuation pages in the browser (more headroom than the worker). */
const MAX_BROWSER_CONTINUATION_PAGES = 8

async function fetchPlaylistViaWatchUrl(
  yt: InstanceType<(typeof import("youtubei.js/web"))["Innertube"]>,
  sourceUrl: string,
  playlistId: string,
  limit: number,
): Promise<PlaylistImportResponse | null> {
  const info = await yt.getInfo(sourceUrl)
  const panel = info.playlist
  if (!panel?.contents?.length) return null

  const items: PlaylistImportItem[] = []
  const seen = new Set<string>()

  for (const entry of panel.contents) {
    if (entry.type !== "PlaylistPanelVideo") continue
    const mapped = mapPlaylistPanelVideo(entry as Parameters<typeof mapPlaylistPanelVideo>[0])
    if (!mapped || seen.has(mapped.videoId)) continue
    seen.add(mapped.videoId)
    items.push(mapped)
    if (items.length >= limit) break
  }

  if (items.length === 0) return null

  return {
    playlistId,
    title: panel.title?.trim() || "Imported playlist",
    items,
    truncated: panel.is_infinite || items.length >= limit,
    totalReported: null,
  }
}

export async function fetchPlaylistInBrowser(
  playlistId: string,
  limit: number,
  options?: { signal?: AbortSignal; sourceUrl?: string },
): Promise<PlaylistImportResponse> {
  throwIfAborted(options?.signal)

  const { Innertube } = await loadInnertube()
  const yt = await Innertube.create({
    generate_session_locally: true,
    cache: {
      cache_dir: "yt-cache",
      get: async (key: string) => memCache[key],
      set: async (key: string, value: ArrayBuffer) => {
        memCache[key] = value
      },
      remove: async (key: string) => {
        delete memCache[key]
      },
    },
  })

  throwIfAborted(options?.signal)

  const normalizedId = normalizePlaylistId(playlistId)
  const sourceUrl = options?.sourceUrl?.trim()

  if (sourceUrl && isWatchPlaylistUrl(sourceUrl)) {
    const fromWatch = await fetchPlaylistViaWatchUrl(yt, sourceUrl, normalizedId, limit)
    if (fromWatch && fromWatch.items.length > 0) {
      return fromWatch
    }
  }

  let playlist = await yt.getPlaylist(normalizedId)
  const items: PlaylistImportItem[] = []
  const seen = new Set<string>()

  const collectItems = () => {
    for (const entry of playlist.videos) {
      let mapped: PlaylistImportItem | null = null
      if (entry.type === "PlaylistVideo") {
        mapped = mapPlaylistVideo(entry as Parameters<typeof mapPlaylistVideo>[0])
      } else if (entry.type === "PlaylistPanelVideo") {
        mapped = mapPlaylistPanelVideo(entry as Parameters<typeof mapPlaylistPanelVideo>[0])
      }
      if (!mapped || seen.has(mapped.videoId)) continue
      seen.add(mapped.videoId)
      items.push(mapped)
      if (items.length >= limit) return
    }
  }

  collectItems()
  let pages = 0
  while (items.length < limit && playlist.has_continuation && pages < MAX_BROWSER_CONTINUATION_PAGES) {
    throwIfAborted(options?.signal)
    playlist = await playlist.getContinuation()
    pages += 1
    collectItems()
  }

  const title = playlist.info.title?.trim() || "Imported playlist"

  return {
    playlistId: normalizedId,
    title,
    items: items.slice(0, limit),
    truncated: items.length >= limit || playlist.has_continuation,
    totalReported: playlist.info.total_items ?? null,
  }
}
