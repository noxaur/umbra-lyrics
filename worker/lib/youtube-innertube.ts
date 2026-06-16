import { ClientType, Innertube } from "youtubei.js/cf-worker"
import {
  INNERTUBE_CLIENT_CHAIN,
  type InnertubeClientName,
  type ResolveAttempt,
  type ResolvedInnertubeStream,
  resolveStreamFromBasicInfo,
} from "./innertube-resolve"
import { mapPlaylistVideo, type PlaylistImportItem } from "./youtube-playlist-map"
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

export async function fetchPlaylistViaInnertube(
  playlistId: string,
  limit: number,
): Promise<PlaylistImportResult> {
  const yt = await createInnertube(ClientType.WEB)
  let playlist = await yt.getPlaylist(normalizePlaylistId(playlistId))

  const items: PlaylistImportItem[] = []
  const seen = new Set<string>()

  const collectItems = () => {
    for (const entry of playlist.items) {
      if (entry.type !== "PlaylistVideo") continue
      const mapped = mapPlaylistVideo(entry as Parameters<typeof mapPlaylistVideo>[0])
      if (!mapped || seen.has(mapped.videoId)) continue
      seen.add(mapped.videoId)
      items.push(mapped)
      if (items.length >= limit) return
    }
  }

  collectItems()
  while (items.length < limit && playlist.has_continuation) {
    playlist = await playlist.getContinuation()
    collectItems()
  }

  const normalizedId = normalizePlaylistId(playlistId)
  const title = playlist.info.title?.trim() || "Imported playlist"

  return {
    playlistId: normalizedId,
    title,
    items: items.slice(0, limit),
    truncated: items.length >= limit || playlist.has_continuation,
    totalReported: playlist.info.total_items ?? null,
  }
}
