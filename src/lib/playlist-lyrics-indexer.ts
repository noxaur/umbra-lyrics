import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { runLyricsPipeline } from "@/lib/lyrics-pipeline"
import {
  clearPlaylistIndexIssue,
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

const queue: QueueJob[] = []
const queuedKeys = new Set<string>()
let activeCount = 0

function queueKey(playlistId: string, videoId: string): string {
  return `${playlistId}:${videoId}`
}

function metadataLooksWeak(track: PlaylistIndexTrack): boolean {
  const normalized = normalizeTrackMetadata(track)
  return !normalized.track.trim() || !normalized.artist.trim()
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

  if (metadataLooksWeak(track)) {
    const meta = await resolveIndexingMetadata(track)
    if (!meta.track.trim() || !meta.artist.trim()) {
      recordIssue(
        playlistId,
        { ...track, artist: meta.artist, track: meta.track },
        "needs_metadata",
        "Artist or track title could not be parsed. Edit the details to search lyrics.",
      )
      return
    }
    Object.assign(track, meta)
  }

  const meta = await resolveIndexingMetadata(track)
  if (!meta.track.trim()) {
    recordIssue(playlistId, track, "needs_metadata", "Track title is missing. Edit it to search lyrics.")
    return
  }
  if (!meta.artist.trim()) {
    recordIssue(playlistId, track, "needs_metadata", "Artist name is missing. Edit it to search lyrics.")
    return
  }

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
    activeCount += 1
    void indexTrack(job).finally(() => {
      activeCount -= 1
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
    queuedKeys.add(key)
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
  queue.unshift({ playlistId, track: { ...track } })
  pumpQueue()
}
