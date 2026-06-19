import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { runLyricsPipeline } from "@/lib/lyrics-pipeline"
import { mediaResolveErrorMessage, resolveMediaInput } from "@/lib/media-url"
import { parseTrackTitle } from "@/lib/parse-track-title"
import type { SeedMetadata } from "@/lib/player-navigation"
import {
  clearQueuePendingMetadata,
  getQueuePendingMetadata,
  upsertQueuePendingMetadata,
} from "@/lib/queue-pending-metadata"
import {
  dismissQueueNotificationsForVideo,
  pushQueueNotification,
} from "@/lib/queue-notifications"
import {
  addTrackToQueue,
  isVideoInQueue,
  updateQueueTrackStatus,
  type QueueTrack,
} from "@/lib/song-queue"
import { readQueueSettings } from "@/lib/song-queue-settings"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"
import { fetchYouTubeOEmbed } from "@/lib/youtube-oembed"
import type { SongSearchHit } from "@/lib/youtube-search"

const MAX_CONCURRENT = 2

type PrefetchJob = {
  videoId: string
  title: string
  artist: string
  track: string
  durationSec: number
  oembedAuthor?: string
}

const prefetchQueue: PrefetchJob[] = []
const prefetching = new Set<string>()
let activePrefetchCount = 0

export type QueueCandidateInput = {
  videoId: string
  title?: string
  artist?: string
  track?: string
  durationSec?: number
  seedMetadata?: SeedMetadata
}

function labelFor(track: Pick<QueueTrack, "artist" | "track" | "title">): string {
  if (track.artist && track.track) return `${track.artist} · ${track.track}`
  return track.title || "Song"
}

async function resolveCandidateMetadata(
  input: QueueCandidateInput,
): Promise<{
  title: string
  artist: string
  track: string
  durationSec: number
  oembedAuthor?: string
}> {
  const oembed = await fetchYouTubeOEmbed(input.videoId).catch(() => null)
  const oembedTitle = oembed?.title?.trim() || input.title?.trim() || ""
  const oembedAuthor = oembed?.author_name?.trim() || undefined
  const rough = parseTrackTitle(oembedTitle, oembedAuthor)

  const resolved = await resolveTrackMetadata({
    title: oembedTitle,
    durationSec: input.durationSec || input.seedMetadata?.durationSec,
    oembedAuthor,
    roughArtist: input.seedMetadata?.artist ?? input.artist ?? rough.artist,
    roughTrack: input.seedMetadata?.track ?? input.track ?? rough.track,
  })

  return {
    title: oembedTitle || input.title || resolved.track,
    artist: resolved.artist || input.artist || rough.artist,
    track: resolved.track || input.track || rough.track,
    durationSec: input.durationSec || input.seedMetadata?.durationSec || resolved.durationSec || 0,
    oembedAuthor,
  }
}

function enqueuePrefetch(job: PrefetchJob): void {
  if (prefetching.has(job.videoId) || getLyricsCache(job.videoId)) {
    updateQueueTrackStatus(job.videoId, "ready")
    return
  }
  prefetchQueue.push(job)
  pumpPrefetchQueue()
}

function pumpPrefetchQueue(): void {
  while (activePrefetchCount < MAX_CONCURRENT && prefetchQueue.length > 0) {
    const job = prefetchQueue.shift()
    if (!job) break
    if (prefetching.has(job.videoId) || getLyricsCache(job.videoId)) {
      updateQueueTrackStatus(job.videoId, "ready")
      continue
    }
    prefetching.add(job.videoId)
    activePrefetchCount += 1
    void prefetchTrack(job).finally(() => {
      prefetching.delete(job.videoId)
      activePrefetchCount -= 1
      pumpPrefetchQueue()
    })
  }
}

async function prefetchTrack(job: PrefetchJob): Promise<void> {
  if (getLyricsCache(job.videoId)) {
    updateQueueTrackStatus(job.videoId, "ready")
    pushQueueNotification({
      kind: "success",
      title: "Ready in queue",
      message: labelFor(job),
      videoId: job.videoId,
    })
    return
  }

  try {
    const pipeline = await runLyricsPipeline({
      track: job.track,
      artist: job.artist,
      title: job.title,
      durationSec: Math.round(job.durationSec) || 0,
      videoId: job.videoId,
      oembedAuthor: job.oembedAuthor,
      skipTranscription: true,
    })

    const cached = cacheLyricsFromPipeline(
      {
        videoId: job.videoId,
        title: job.title,
        artist: job.artist,
        track: job.track,
        durationSec: job.durationSec,
        oembedAuthor: job.oembedAuthor,
      },
      pipeline,
    )

    const status = cached || pipeline.native.status === "instrumental" ? "ready" : "error"
    updateQueueTrackStatus(job.videoId, status)

    pushQueueNotification({
      kind: status === "ready" ? "success" : "info",
      title: status === "ready" ? "Ready in queue" : "Added to queue",
      message:
        status === "ready"
          ? labelFor(job)
          : `${labelFor(job)} — lyrics will load when you play it`,
      videoId: job.videoId,
    })
  } catch {
    updateQueueTrackStatus(job.videoId, "error")
    pushQueueNotification({
      kind: "info",
      title: "Added to queue",
      message: `${labelFor(job)} — prefetch failed, lyrics will load on play`,
      videoId: job.videoId,
    })
  }
}

function commitToQueue(
  videoId: string,
  meta: Awaited<ReturnType<typeof resolveCandidateMetadata>>,
  seedMetadata?: SeedMetadata,
): { ok: true; track: QueueTrack } | { ok: false; error: string; duplicate?: boolean } {
  if (isVideoInQueue(videoId)) {
    return { ok: false, error: "Already in queue", duplicate: true }
  }

  const result = addTrackToQueue({
    videoId,
    title: meta.title,
    artist: meta.artist,
    track: meta.track,
    seedMetadata,
    status: getLyricsCache(videoId) ? "ready" : "prefetching",
  })

  if (result.error || !result.track) {
    return { ok: false, error: result.error ?? "Could not add to queue" }
  }

  enqueuePrefetch({
    videoId,
    title: meta.title,
    artist: meta.artist,
    track: meta.track,
    durationSec: meta.durationSec,
    oembedAuthor: meta.oembedAuthor,
  })

  return { ok: true, track: result.track }
}

export async function submitQueueCandidate(input: QueueCandidateInput): Promise<{
  ok: boolean
  error?: string
  duplicate?: boolean
  pendingMetadata?: boolean
}> {
  const { videoId } = input
  if (!videoId) return { ok: false, error: "Missing video ID" }

  if (isVideoInQueue(videoId)) {
    pushQueueNotification({
      kind: "info",
      title: "Already in queue",
      message: input.title,
      videoId,
      dismissAfterMs: 3000,
    })
    return { ok: false, error: "Already in queue", duplicate: true }
  }

  pushQueueNotification({
    kind: "info",
    title: "Resolving song…",
    message: input.title,
    videoId,
    dismissAfterMs: 2500,
  })

  try {
    const meta = await resolveCandidateMetadata(input)
    const settings = readQueueSettings()

    if (!settings.autoApproveMetadata) {
      upsertQueuePendingMetadata({
        videoId,
        title: meta.title,
        artist: meta.artist,
        track: meta.track,
        durationSec: meta.durationSec || undefined,
        seedMetadata: input.seedMetadata,
      })
      dismissQueueNotificationsForVideo(videoId)
      pushQueueNotification({
        kind: "metadata",
        title: "Confirm song details",
        message: labelFor(meta),
        videoId,
      })
      return { ok: true, pendingMetadata: true }
    }

    const committed = commitToQueue(videoId, meta, input.seedMetadata)
    dismissQueueNotificationsForVideo(videoId)
    if (!committed.ok) {
      if (committed.duplicate) {
        pushQueueNotification({
          kind: "info",
          title: "Already in queue",
          message: labelFor(meta),
          videoId,
        })
      } else {
        pushQueueNotification({
          kind: "error",
          title: "Could not add to queue",
          message: committed.error,
          videoId,
        })
      }
      return { ok: false, error: committed.error, duplicate: committed.duplicate }
    }

    pushQueueNotification({
      kind: "info",
      title: "Queued",
      message: labelFor(meta),
      videoId,
      dismissAfterMs: 2500,
    })
    return { ok: true }
  } catch {
    pushQueueNotification({
      kind: "error",
      title: "Could not resolve song",
      message: input.title,
      videoId,
    })
    return { ok: false, error: "Could not resolve song" }
  }
}

export async function confirmQueuePendingMetadata(
  videoId: string,
  artist: string,
  track: string,
): Promise<{ ok: boolean; error?: string }> {
  const item = getQueuePendingMetadata(videoId)
  if (!item) return { ok: false, error: "Pending item not found" }

  const meta = {
    title: item.title,
    artist: artist.trim(),
    track: track.trim(),
    durationSec: item.durationSec ?? 0,
    oembedAuthor: undefined as string | undefined,
  }

  if (!meta.track) return { ok: false, error: "Track title is required" }

  clearQueuePendingMetadata(videoId)
  dismissQueueNotificationsForVideo(videoId)

  const committed = commitToQueue(videoId, meta, item.seedMetadata)
  if (!committed.ok) {
    pushQueueNotification({
      kind: "error",
      title: "Could not add to queue",
      message: committed.error,
      videoId,
    })
    return { ok: false, error: committed.error }
  }

  pushQueueNotification({
    kind: "info",
    title: "Queued",
    message: labelFor(meta),
    videoId,
    dismissAfterMs: 2500,
  })
  return { ok: true }
}

export function dismissQueuePendingMetadata(videoId: string): void {
  clearQueuePendingMetadata(videoId)
  dismissQueueNotificationsForVideo(videoId)
}

export async function submitQueueFromUrl(
  url: string,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, error: "Enter a URL" }

  const resolved = await resolveMediaInput(trimmed, options)
  if (resolved === null) {
    return { ok: false, error: mediaResolveErrorMessage({ kind: "invalid" }) }
  }
  if (!resolved.ok) {
    return { ok: false, error: mediaResolveErrorMessage(resolved.error) }
  }

  const { result } = resolved
  const result2 = await submitQueueCandidate({
    videoId: result.videoId,
    seedMetadata: result.seedMetadata,
  })
  return { ok: result2.ok, error: result2.error }
}

export async function submitQueueFromSearch(hit: SongSearchHit): Promise<{ ok: boolean; error?: string }> {
  const { artist, track } = parseTrackTitle(hit.title)
  const result = await submitQueueCandidate({
    videoId: hit.videoId,
    title: hit.title,
    artist,
    track,
    durationSec: hit.durationSec ?? undefined,
  })
  return { ok: result.ok, error: result.error }
}

export async function submitCurrentTrackToQueue(track: {
  videoId: string
  title: string
  artist: string
  track: string
}): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const result = await submitQueueCandidate(track)
  return { ok: result.ok, error: result.error, duplicate: result.duplicate }
}
