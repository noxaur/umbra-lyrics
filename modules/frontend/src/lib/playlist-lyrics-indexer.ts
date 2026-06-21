import { isLyricsRejected } from "@/lib/lyrics-rejection"
import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { runLyricsPipeline } from "@/lib/lyrics-pipeline"
import {
  clearPlaylistIndexIssue,
  listPlaylistIndexIssues,
  upsertPlaylistIndexIssue,
  type PlaylistIndexIssueReason,
} from "@/lib/playlist-index-issues"
import { normalizeTrackMetadata } from "@/lib/track-label"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"
import { fetchYouTubeAuthor } from "@/lib/youtube-oembed"
import type { PlaylistTrack } from "@/lib/playlists"
import { getPlaylistById } from "@/lib/playlists"

const MAX_CONCURRENT = 2

export type PlaylistIndexTrack = Omit<PlaylistTrack, "addedAt"> & {
  durationSec?: number | null
}

type QueueJob = {
  playlistId: string
  track: PlaylistIndexTrack
}

export type PlaylistIndexingState = {
  activeCount: number
  queuedCount: number
  lastFinishedAt: number | null
}

export type PlaylistIndexingSummary = {
  total: number
  cached: number
  failed: number
  needsMetadata: number
  pending: number
}

type IndexingListener = (playlistId: string, state: PlaylistIndexingState) => void

const queue: QueueJob[] = []
const queuedKeys = new Set<string>()
let activeCount = 0
const activeByPlaylist = new Map<string, number>()
const queuedByPlaylist = new Map<string, number>()
const lastFinishedAt = new Map<string, number>()
const idleResolvers = new Map<string, Array<() => void>>()
const listeners = new Set<IndexingListener>()

function queueKey(playlistId: string, videoId: string): string {
  return `${playlistId}:${videoId}`
}

function getPlaylistState(playlistId: string): PlaylistIndexingState {
  return {
    activeCount: activeByPlaylist.get(playlistId) ?? 0,
    queuedCount: queuedByPlaylist.get(playlistId) ?? 0,
    lastFinishedAt: lastFinishedAt.get(playlistId) ?? null,
  }
}

function notifyListeners(playlistId: string): void {
  const state = getPlaylistState(playlistId)
  for (const listener of listeners) {
    listener(playlistId, state)
  }
}

function incrementActive(playlistId: string): void {
  activeCount += 1
  activeByPlaylist.set(playlistId, (activeByPlaylist.get(playlistId) ?? 0) + 1)
  notifyListeners(playlistId)
}

function decrementActive(playlistId: string): void {
  activeCount -= 1
  const next = (activeByPlaylist.get(playlistId) ?? 1) - 1
  if (next <= 0) {
    activeByPlaylist.delete(playlistId)
  } else {
    activeByPlaylist.set(playlistId, next)
  }
  lastFinishedAt.set(playlistId, Date.now())
  notifyListeners(playlistId)

  const state = getPlaylistState(playlistId)
  if (state.activeCount === 0 && state.queuedCount === 0) {
    const resolvers = idleResolvers.get(playlistId) ?? []
    idleResolvers.delete(playlistId)
    for (const resolve of resolvers) resolve()
  }
}

function incrementQueued(playlistId: string): void {
  queuedByPlaylist.set(playlistId, (queuedByPlaylist.get(playlistId) ?? 0) + 1)
  notifyListeners(playlistId)
}

function decrementQueued(playlistId: string): void {
  const next = (queuedByPlaylist.get(playlistId) ?? 1) - 1
  if (next <= 0) {
    queuedByPlaylist.delete(playlistId)
  } else {
    queuedByPlaylist.set(playlistId, next)
  }
  notifyListeners(playlistId)
}

export function subscribePlaylistIndexing(listener: IndexingListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPlaylistIndexingState(playlistId: string): PlaylistIndexingState {
  return getPlaylistState(playlistId)
}

export function waitForPlaylistIndexingIdle(playlistId: string): Promise<void> {
  const state = getPlaylistState(playlistId)
  if (state.activeCount === 0 && state.queuedCount === 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const list = idleResolvers.get(playlistId) ?? []
    list.push(resolve)
    idleResolvers.set(playlistId, list)
  })
}

export function getPlaylistIndexingSummary(playlistId: string): PlaylistIndexingSummary {
  const playlist = getPlaylistById(playlistId)
  const tracks = playlist?.tracks ?? []
  const issues = listPlaylistIndexIssues().filter((i) => i.playlistId === playlistId)

  let cached = 0
  for (const track of tracks) {
    if (getLyricsCache(track.videoId)) cached += 1
  }

  const failed = issues.filter((i) => i.reason === "index_failed").length
  const needsMetadata = issues.filter((i) => i.reason === "needs_metadata").length
  const state = getPlaylistState(playlistId)
  const pending = state.activeCount + state.queuedCount

  return {
    total: tracks.length,
    cached,
    failed,
    needsMetadata,
    pending,
  }
}

function recordIssue(
  playlistId: string,
  track: PlaylistIndexTrack,
  reason: PlaylistIndexIssueReason,
  message: string,
): void {
  upsertPlaylistIndexIssue({
    videoId: track.videoId,
    playlistId,
    title: track.title,
    artist: track.artist,
    track: track.track,
    reason,
    message,
  })
}

async function resolveIndexingMetadata(
  track: PlaylistIndexTrack,
): Promise<{ artist: string; track: string; title: string; durationSec: number; oembedAuthor?: string }> {
  const normalized = normalizeTrackMetadata(track)
  let durationSec = track.durationSec ?? 0
  let oembedAuthor: string | undefined

  if (!durationSec) {
    try {
      oembedAuthor = (await fetchYouTubeAuthor(track.videoId)) ?? undefined
    } catch {
      // Best-effort only
    }
  }

  const resolved = await resolveTrackMetadata({
    title: normalized.title,
    durationSec: durationSec || undefined,
    oembedAuthor,
    roughArtist: normalized.artist,
    roughTrack: normalized.track,
  })

  if (!durationSec && resolved.durationSec) {
    durationSec = resolved.durationSec
  }

  return {
    artist: resolved.artist || normalized.artist,
    track: resolved.track || normalized.track,
    title: normalized.title,
    durationSec: durationSec || resolved.durationSec || 0,
    oembedAuthor,
  }
}

async function indexTrack(job: QueueJob): Promise<void> {
  const { playlistId, track } = job

  if (getLyricsCache(track.videoId)) {
    clearPlaylistIndexIssue(track.videoId)
    return
  }

  if (isLyricsRejected(track.videoId)) {
    return
  }

  const meta = await resolveIndexingMetadata(track)
  if (!meta.track.trim() && !meta.artist.trim()) {
    recordIssue(
      playlistId,
      { ...track, artist: meta.artist, track: meta.track },
      "needs_metadata",
      "Artist or track title could not be parsed. Edit the details to search lyrics.",
    )
    return
  }
  if (!meta.track.trim()) {
    recordIssue(
      playlistId,
      { ...track, artist: meta.artist, track: meta.track },
      "needs_metadata",
      "Track title is missing. Edit it to search lyrics.",
    )
    return
  }
  if (!meta.artist.trim()) {
    recordIssue(
      playlistId,
      { ...track, artist: meta.artist, track: meta.track },
      "needs_metadata",
      "Artist name is missing. Edit it to search lyrics.",
    )
    return
  }
  Object.assign(track, meta)

  try {
    const pipeline = await runLyricsPipeline({
      track: meta.track,
      artist: meta.artist,
      title: meta.title,
      durationSec: Math.round(meta.durationSec) || 0,
      videoId: track.videoId,
      oembedAuthor: meta.oembedAuthor,
      skipTranscription: true,
    })

    const cached = cacheLyricsFromPipeline(
      {
        videoId: track.videoId,
        title: meta.title,
        artist: meta.artist,
        track: meta.track,
        durationSec: meta.durationSec,
        oembedAuthor: meta.oembedAuthor,
      },
      pipeline,
    )

    if (cached) {
      clearPlaylistIndexIssue(track.videoId)
      return
    }

    if (pipeline.native.status === "instrumental") {
      clearPlaylistIndexIssue(track.videoId)
      return
    }

    recordIssue(
      playlistId,
      track,
      "index_failed",
      pipeline.native.message || "Lyrics could not be indexed for this track.",
    )
  } catch {
    recordIssue(
      playlistId,
      track,
      "index_failed",
      "Lyrics indexing failed — check your connection and try again.",
    )
  }
}

function pumpQueue(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()
    if (!job) break
    queuedKeys.delete(queueKey(job.playlistId, job.track.videoId))
    decrementQueued(job.playlistId)
    incrementActive(job.playlistId)
    void indexTrack(job).finally(() => {
      decrementActive(job.playlistId)
      pumpQueue()
    })
  }
}

export function enqueuePlaylistLyricsIndexing(
  playlistId: string,
  tracks?: PlaylistIndexTrack[],
): void {
  const source =
    tracks ??
    getPlaylistById(playlistId)?.tracks.map(({ addedAt: _addedAt, ...track }) => track) ??
    []

  for (const track of source) {
    const key = queueKey(playlistId, track.videoId)
    if (queuedKeys.has(key)) continue
    if (getLyricsCache(track.videoId)) continue
    if (isLyricsRejected(track.videoId)) continue
    queuedKeys.add(key)
    incrementQueued(playlistId)
    queue.push({ playlistId, track: { ...track } })
  }

  pumpQueue()
}

export async function retryPlaylistTrackIndexing(
  playlistId: string,
  track: PlaylistIndexTrack,
): Promise<void> {
  clearPlaylistIndexIssue(track.videoId)
  const key = queueKey(playlistId, track.videoId)
  if (queuedKeys.has(key)) return
  queuedKeys.add(key)
  incrementQueued(playlistId)
  queue.unshift({ playlistId, track: { ...track } })
  pumpQueue()
}

export async function runAutomaticPlaylistLyricsIndexing(
  playlistId: string,
  tracks?: PlaylistIndexTrack[],
): Promise<{ hasIssues: boolean; summary: PlaylistIndexingSummary }> {
  enqueuePlaylistLyricsIndexing(playlistId, tracks)
  await waitForPlaylistIndexingIdle(playlistId)
  const summary = getPlaylistIndexingSummary(playlistId)
  return {
    hasIssues: summary.failed + summary.needsMetadata > 0,
    summary,
  }
}
