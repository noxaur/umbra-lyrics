import { ClientType, Innertube } from "youtubei.js/cf-worker"
import {
  INNERTUBE_CLIENT_CHAIN,
  type InnertubeClientName,
  type ResolveAttempt,
  type ResolvedInnertubeStream,
  resolveStreamFromBasicInfo,
} from "./innertube-resolve"
import {
  mapPlaylistPanelVideo,
  mapPlaylistVideo,
  type PlaylistImportItem,
} from "./youtube-playlist-map"
import { fetchPlaylistViaRss } from "./youtube-playlist-rss"
import { mapSearchVideos, searchCandidateLimit } from "./youtube-search-map"
import { rankSongSearchHits, type SongSearchHit } from "./youtube-search-rank"

export type { PlaylistImportItem }
export type PlaylistImportResult = {
  playlistId: string
  title: string
  items: PlaylistImportItem[]
  truncated: boolean
  totalReported: string | null
}

export type { ResolvedInnertubeStream as InnertubeResolvedStream, ResolveAttempt, SongSearchHit }

type StreamKind = "audio" | "video"

const memCache: Record<string, ArrayBuffer> = {}

const innertubeCache = new Map<string, Promise<Innertube>>()

function clientTypeFromName(name: InnertubeClientName): ClientType {
  return ClientType[name as keyof typeof ClientType] ?? ClientType.WEB
}

function createInnertube(clientType: ClientType): Promise<Innertube> {
  const key = String(clientType)
  const existing = innertubeCache.get(key)
  if (existing) return existing

  const created = Innertube.create({
    generate_session_locally: true,
    client_type: clientType,
    cache: {
      cache_dir: "yt-cache",
      get: async (cacheKey: string) => memCache[cacheKey],
      set: async (cacheKey: string, value: ArrayBuffer) => {
        memCache[cacheKey] = value
      },
      remove: async (cacheKey: string) => {
        delete memCache[cacheKey]
      },
    },
  })

  innertubeCache.set(key, created)
  return created
}

export async function resolveStreamViaInnertube(
  videoId: string,
  kind: StreamKind,
): Promise<ResolvedInnertubeStream | null> {
  const result = await resolveStreamViaInnertubeDetailed(videoId, kind)
  return result.stream
}

export async function resolveStreamViaInnertubeDetailed(
  videoId: string,
  kind: StreamKind,
): Promise<{ stream: ResolvedInnertubeStream | null; attempts: ResolveAttempt[] }> {
  const attempts: ResolveAttempt[] = []

  for (const clientName of INNERTUBE_CLIENT_CHAIN) {
    const clientType = clientTypeFromName(clientName)
    try {
      const yt = await createInnertube(clientType)
      const info = await yt.getBasicInfo(videoId)
      const outcome = await resolveStreamFromBasicInfo(yt, info, kind, clientName)
      attempts.push(outcome.attempt)
      if ("stream" in outcome && outcome.stream) {
        return { stream: outcome.stream, attempts }
      }
    } catch (error) {
      attempts.push({
        client: clientName,
        error: error instanceof Error ? error.message : "Client failed",
        resolved: false,
      })
    }
  }

  return { stream: null, attempts }
}

export async function searchViaInnertube(query: string, limit: number): Promise<SongSearchHit[]> {
  const yt = await createInnertube(ClientType.WEB)
  const search = await yt.search(query, { type: "video" })
  const mapped = mapSearchVideos(
    [...search.videos] as Parameters<typeof mapSearchVideos>[0],
    searchCandidateLimit(limit),
  )
  return rankSongSearchHits(mapped).slice(0, limit)
}

function normalizePlaylistId(playlistId: string): string {
  const trimmed = playlistId.trim()
  return trimmed.startsWith("VL") ? trimmed.slice(2) : trimmed
}

const MAX_CONTINUATION_PAGES = 2

export type FetchPlaylistOptions = {
  sourceUrl?: string
}

function isUnviewablePlaylistId(playlistId: string): boolean {
  return /^(RD|LL|LM|OLAK5uy_|FL|WL)/.test(playlistId)
}

function isWatchPlaylistUrl(sourceUrl: string): boolean {
  try {
    const url = new URL(sourceUrl)
    return Boolean(url.searchParams.get("v")?.trim() && url.searchParams.get("list")?.trim())
  } catch {
    return false
  }
}

function mapPlaylistEntry(entry: { type: string }): PlaylistImportItem | null {
  if (entry.type === "PlaylistVideo") {
    return mapPlaylistVideo(entry as Parameters<typeof mapPlaylistVideo>[0])
  }
  if (entry.type === "PlaylistPanelVideo") {
    return mapPlaylistPanelVideo(entry as Parameters<typeof mapPlaylistPanelVideo>[0])
  }
  return null
}

async function fetchPlaylistViaWatchUrl(
  yt: Awaited<ReturnType<typeof createInnertube>>,
  sourceUrl: string,
  playlistId: string,
  limit: number,
): Promise<PlaylistImportResult | null> {
  let info
  try {
    info = await yt.getInfo(sourceUrl)
  } catch {
    return null
  }
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

export async function fetchPlaylistViaInnertube(
  playlistId: string,
  limit: number,
  options: FetchPlaylistOptions = {},
): Promise<PlaylistImportResult> {
  const yt = await createInnertube(ClientType.WEB)
  const normalizedId = normalizePlaylistId(playlistId)
  const sourceUrl = options.sourceUrl?.trim()

  if (sourceUrl && isWatchPlaylistUrl(sourceUrl)) {
    try {
      const fromWatch = await fetchPlaylistViaWatchUrl(yt, sourceUrl, normalizedId, limit)
      if (fromWatch && fromWatch.items.length > 0) return fromWatch
    } catch {
      // Watch-page panel unavailable; fall back to playlist browse when allowed.
    }
  }

  if (isUnviewablePlaylistId(normalizedId)) {
    throw new Error("This mix playlist cannot be imported. Open it on YouTube and copy a standard playlist link (list=PL…).")
  }

  try {
    let playlist = await yt.getPlaylist(normalizedId)

    const items: PlaylistImportItem[] = []
    const seen = new Set<string>()

    const collectItems = () => {
      for (const entry of playlist.videos) {
        const mapped = mapPlaylistEntry(entry)
        if (!mapped || seen.has(mapped.videoId)) continue
        seen.add(mapped.videoId)
        items.push(mapped)
        if (items.length >= limit) return
      }
    }

    collectItems()
    let pages = 0
    while (items.length < limit && playlist.has_continuation && pages < MAX_CONTINUATION_PAGES) {
      playlist = await playlist.getContinuation()
      pages += 1
      collectItems()
    }

    const title = playlist.info.title?.trim() || "Imported playlist"
    const browseResult: PlaylistImportResult = {
      playlistId: normalizedId,
      title,
      items: items.slice(0, limit),
      truncated: items.length >= limit || playlist.has_continuation,
      totalReported: playlist.info.total_items ?? null,
    }

    if (browseResult.items.length > 0) return browseResult

    const fromRss = await fetchPlaylistViaRss(normalizedId, limit)
    if (fromRss && fromRss.items.length > 0) {
      return {
        ...fromRss,
        title: browseResult.title !== "Imported playlist" ? browseResult.title : fromRss.title,
        totalReported: browseResult.totalReported,
      }
    }

    return browseResult
  } catch (error) {
    const fromRss = await fetchPlaylistViaRss(normalizedId, limit)
    if (fromRss && fromRss.items.length > 0) return fromRss
    throw error
  }
}
