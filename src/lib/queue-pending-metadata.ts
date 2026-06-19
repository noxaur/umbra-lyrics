import type { SeedMetadata } from "@/lib/player-navigation"

const STORAGE_KEY = "song-kara-queue-pending-metadata"

export type QueuePendingMetadata = {
  videoId: string
  title: string
  artist: string
  track: string
  durationSec?: number
  seedMetadata?: SeedMetadata
  createdAt: number
}

type PendingListener = () => void
const listeners = new Set<PendingListener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribeQueuePendingMetadata(listener: PendingListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readPending(): QueuePendingMetadata[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is QueuePendingMetadata =>
        !!item &&
        typeof item === "object" &&
        typeof (item as QueuePendingMetadata).videoId === "string" &&
        typeof (item as QueuePendingMetadata).title === "string",
    )
  } catch {
    return []
  }
}

function writePending(items: QueuePendingMetadata[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  notify()
}

export function listQueuePendingMetadata(): QueuePendingMetadata[] {
  return readPending()
}

export function getQueuePendingMetadata(videoId: string): QueuePendingMetadata | undefined {
  return readPending().find((item) => item.videoId === videoId)
}

export function upsertQueuePendingMetadata(
  item: Omit<QueuePendingMetadata, "createdAt">,
): QueuePendingMetadata {
  const pending = readPending().filter((entry) => entry.videoId !== item.videoId)
  const next: QueuePendingMetadata = { ...item, createdAt: Date.now() }
  pending.push(next)
  writePending(pending)
  return next
}

export function clearQueuePendingMetadata(videoId: string): void {
  const next = readPending().filter((item) => item.videoId !== videoId)
  if (next.length === readPending().length) return
  writePending(next)
}

export function clearAllQueuePendingMetadata(): void {
  writePending([])
}
