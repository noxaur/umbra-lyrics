import { normalizeTrackMetadata, type TrackMetadata } from "@/lib/track-label"
import type { SeedMetadata } from "@/lib/player-navigation"

export const SONG_QUEUE_STORAGE_KEY = "umbra-queue"
export const MAX_QUEUE_TRACKS = 100

export type QueueTrackStatus = "prefetching" | "ready" | "error"

export type QueueTrack = TrackMetadata & {
  addedAt: number
  status: QueueTrackStatus
  durationSec?: number
  seedMetadata?: SeedMetadata
}

export type QueuePlaybackContext = {
  trackIndex: number
}

type QueueListener = () => void
const listeners = new Set<QueueListener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeSongQueue(listener: QueueListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function isQueueTrack(value: unknown): value is QueueTrack {
  if (!value || typeof value !== "object") return false
  const t = value as Partial<QueueTrack>
  return (
    typeof t.videoId === "string" &&
    typeof t.title === "string" &&
    typeof t.addedAt === "number" &&
    (t.status === "prefetching" || t.status === "ready" || t.status === "error")
  )
}

function normalizeQueueTrack(track: QueueTrack): QueueTrack {
  return {
    ...normalizeTrackMetadata(track),
    addedAt: track.addedAt,
    status: track.status,
    durationSec:
      typeof track.durationSec === "number" && track.durationSec > 0
        ? track.durationSec
        : undefined,
    seedMetadata: track.seedMetadata,
  }
}

export function readSongQueue(): QueueTrack[] {
  try {
    const raw = localStorage.getItem(SONG_QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueueTrack).map(normalizeQueueTrack).slice(0, MAX_QUEUE_TRACKS)
  } catch {
    return []
  }
}

function writeSongQueue(tracks: QueueTrack[]): void {
  localStorage.setItem(
    SONG_QUEUE_STORAGE_KEY,
    JSON.stringify(tracks.slice(0, MAX_QUEUE_TRACKS)),
  )
  notify()
}

export function getQueueTrackAt(index: number): QueueTrack | undefined {
  return readSongQueue()[index]
}

export function getQueueTrackByVideoId(videoId: string): QueueTrack | undefined {
  return readSongQueue().find((t) => t.videoId === videoId)
}

export function isVideoInQueue(videoId: string): boolean {
  return readSongQueue().some((t) => t.videoId === videoId)
}

export type AddQueueTrackInput = Omit<QueueTrack, "addedAt" | "status"> & {
  status?: QueueTrackStatus
}

export function addTrackToQueue(
  track: AddQueueTrackInput,
): { track?: QueueTrack; error?: string; duplicate?: boolean } {
  const queue = readSongQueue()
  if (queue.some((t) => t.videoId === track.videoId)) {
    return { duplicate: true, error: "Already in queue" }
  }
  if (queue.length >= MAX_QUEUE_TRACKS) {
    return { error: `Queue is full (max ${MAX_QUEUE_TRACKS})` }
  }

  const normalized = normalizeQueueTrack({
    ...track,
    addedAt: Date.now(),
    status: track.status ?? "prefetching",
  })
  writeSongQueue([...queue, normalized])
  return { track: normalized }
}

export function updateQueueTrackStatus(
  videoId: string,
  status: QueueTrackStatus,
): QueueTrack | undefined {
  const queue = readSongQueue()
  const index = queue.findIndex((t) => t.videoId === videoId)
  if (index === -1) return undefined
  queue[index] = { ...queue[index], status }
  writeSongQueue(queue)
  return queue[index]
}

export function updateQueueTrackMetadata(
  videoId: string,
  metadata: Pick<QueueTrack, "artist" | "track" | "title">,
): QueueTrack | undefined {
  const queue = readSongQueue()
  const index = queue.findIndex((t) => t.videoId === videoId)
  if (index === -1) return undefined
  const current = queue[index]
  queue[index] = normalizeQueueTrack({
    ...current,
    ...metadata,
    title: metadata.title?.trim() || current.title,
    artist: metadata.artist?.trim() ?? current.artist,
    track: metadata.track?.trim() ?? current.track,
  })
  writeSongQueue(queue)
  return queue[index]
}

export function removeTrackFromQueue(videoId: string): void {
  const next = readSongQueue().filter((t) => t.videoId !== videoId)
  if (next.length === readSongQueue().length) return
  writeSongQueue(next)
}

export function reorderQueueTracks(fromIndex: number, toIndex: number): { error?: string } {
  const queue = [...readSongQueue()]
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return { error: "Invalid track index" }
  }
  const [moved] = queue.splice(fromIndex, 1)
  queue.splice(toIndex, 0, moved)
  writeSongQueue(queue)
  return {}
}

export function moveQueueTrack(videoId: string, direction: "up" | "down"): { error?: string } {
  const queue = readSongQueue()
  const fromIndex = queue.findIndex((t) => t.videoId === videoId)
  if (fromIndex === -1) return { error: "Track not found" }
  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
  if (toIndex < 0 || toIndex >= queue.length) return {}
  return reorderQueueTracks(fromIndex, toIndex)
}

export function clearSongQueue(): void {
  writeSongQueue([])
}

export function clearSongQueueStorage(): void {
  localStorage.removeItem(SONG_QUEUE_STORAGE_KEY)
}
