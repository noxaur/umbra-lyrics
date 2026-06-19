import { mapSearchVideos, searchCandidateLimit } from "./youtube-search-map"
import { rankSongSearchHits, type SongSearchHit } from "./youtube-search-rank"
import type { YouTubeMusicHit } from "./youtube-music-rank"

type MusicListItemLike = {
  id?: string
  title?: string
  name?: string
  item_type?: YouTubeMusicHit["resultType"]
  duration?: { seconds?: number }
  artists?: Array<{ name?: string }>
  authors?: Array<{ name?: string }>
  author?: { name?: string }
}

type MusicSearchResult = {
  songs?: { contents?: unknown[] }
  videos?: { contents?: unknown[] }
}

type VideoSearchResult = {
  videos?: Iterable<unknown>
}

export type MusicSearchInnertube = {
  music: {
    search: (query: string, filters: { type: "song" | "video" }) => Promise<MusicSearchResult>
  }
  search: (query: string, filters: { type: "video" }) => Promise<VideoSearchResult>
}

export function mapMusicItem(item: MusicListItemLike): YouTubeMusicHit | null {
  const videoId = item.id?.trim()
  if (!videoId) return null
  const title = item.title?.trim() || item.name?.trim() || videoId
  const channel =
    item.artists?.[0]?.name?.trim() ||
    item.authors?.[0]?.name?.trim() ||
    item.author?.name?.trim() ||
    ""
  const resultType = item.item_type ?? "unknown"

  return {
    videoId,
    title,
    channel,
    durationSec: item.duration?.seconds ?? null,
    resultType,
    isOfficialAudio: resultType === "song" || /\s-\sTopic$/i.test(channel),
  }
}

export function collectMusicHits(search: MusicSearchResult): YouTubeMusicHit[] {
  const hits: YouTubeMusicHit[] = []
  const seen = new Set<string>()
  const shelves = [search.songs, search.videos].filter(Boolean)

  for (const shelf of shelves) {
    for (const item of [...(shelf?.contents ?? [])] as MusicListItemLike[]) {
      const hit = mapMusicItem(item)
      if (!hit || seen.has(hit.videoId)) continue
      seen.add(hit.videoId)
      hits.push(hit)
    }
  }

  return hits
}

export function musicHitToSongSearchHit(hit: YouTubeMusicHit): SongSearchHit {
  return {
    videoId: hit.videoId,
    title: hit.title,
    channel: hit.channel,
    durationSec: hit.durationSec,
    viewCount: hit.viewCount,
  }
}

export function mergeMusicBiasedSearchResults(
  musicHits: SongSearchHit[],
  webHits: SongSearchHit[],
  limit: number,
): SongSearchHit[] {
  const seen = new Set<string>()
  const merged: SongSearchHit[] = []

  for (const hit of rankSongSearchHits(musicHits)) {
    if (seen.has(hit.videoId)) continue
    seen.add(hit.videoId)
    merged.push(hit)
    if (merged.length >= limit) return merged
  }

  for (const hit of rankSongSearchHits(webHits)) {
    if (seen.has(hit.videoId)) continue
    seen.add(hit.videoId)
    merged.push(hit)
    if (merged.length >= limit) return merged
  }

  return merged
}

async function searchMusicCatalog(
  yt: MusicSearchInnertube,
  query: string,
  candidateLimit: number,
): Promise<SongSearchHit[]> {
  const [songSearch, videoSearch] = await Promise.all([
    yt.music.search(query, { type: "song" }),
    yt.music.search(query, { type: "video" }),
  ])

  const musicHits = [...collectMusicHits(songSearch), ...collectMusicHits(videoSearch)]
  const seen = new Set<string>()
  const mapped: SongSearchHit[] = []
  for (const hit of musicHits) {
    if (seen.has(hit.videoId)) continue
    seen.add(hit.videoId)
    mapped.push(musicHitToSongSearchHit(hit))
    if (mapped.length >= candidateLimit) break
  }

  return mapped
}

async function searchViaWebVideos(
  yt: MusicSearchInnertube,
  query: string,
  limit: number,
): Promise<SongSearchHit[]> {
  const search = await yt.search(query, { type: "video" })
  const mapped = mapSearchVideos(
    [...(search.videos ?? [])] as Parameters<typeof mapSearchVideos>[0],
    searchCandidateLimit(limit),
  )
  return rankSongSearchHits(mapped)
}

export async function searchSongsMusicFirst(
  yt: MusicSearchInnertube,
  query: string,
  limit: number,
): Promise<SongSearchHit[]> {
  const candidateLimit = searchCandidateLimit(limit)

  const [musicResult, webResult] = await Promise.allSettled([
    searchMusicCatalog(yt, query, candidateLimit),
    searchViaWebVideos(yt, query, limit),
  ])

  const musicHits = musicResult.status === "fulfilled" ? musicResult.value : []
  const webHits = webResult.status === "fulfilled" ? webResult.value : []

  const merged = mergeMusicBiasedSearchResults(musicHits, webHits, limit)
  if (merged.length > 0) return merged

  if (webResult.status === "rejected") throw webResult.reason
  if (musicResult.status === "rejected") throw musicResult.reason
  return merged
}
