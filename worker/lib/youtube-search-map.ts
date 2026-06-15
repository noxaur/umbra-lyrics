import type { SongSearchHit } from "./youtube-search-rank"

type SearchableVideo = {
  video_id?: string
  title?: { toString(): string }
  author?: { name?: string }
  duration?: { seconds?: number } | null
  length_text?: { toString(): string }
  view_count?: { toString(): string }
  short_view_count?: { toString(): string }
  is_live?: boolean
}

function readDurationSeconds(video: SearchableVideo): number | null {
  const fromDuration = video.duration?.seconds
  if (typeof fromDuration === "number" && fromDuration > 0) return fromDuration

  const raw = video.length_text?.toString().trim()
  if (!raw) return null

  const parts = raw.split(":").map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

export function parseViewCount(raw?: string): number | undefined {
  if (!raw) return undefined

  const cleaned = raw
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s*views?/g, "")
    .trim()
  const match = cleaned.match(/^([\d.]+)\s*([kmb])?/)
  if (!match) return undefined

  const num = Number(match[1])
  if (!Number.isFinite(num)) return undefined

  const suffix = match[2]
  if (suffix === "k") return Math.round(num * 1_000)
  if (suffix === "m") return Math.round(num * 1_000_000)
  if (suffix === "b") return Math.round(num * 1_000_000_000)
  return Math.round(num)
}

export function mapSearchVideo(video: SearchableVideo): SongSearchHit | null {
  const videoId = video.video_id?.trim()
  if (!videoId) return null
  if (video.is_live) return null

  const title = video.title?.toString().trim() ?? ""
  const channel = video.author?.name?.trim() ?? ""
  const durationSec = readDurationSeconds(video)
  const viewCount = parseViewCount(
    video.view_count?.toString() ?? video.short_view_count?.toString(),
  )

  return {
    videoId,
    title: title || videoId,
    channel,
    durationSec,
    viewCount,
  }
}

export function mapSearchVideos(videos: SearchableVideo[], limit: number): SongSearchHit[] {
  const hits: SongSearchHit[] = []
  const seen = new Set<string>()

  for (const video of videos) {
    const hit = mapSearchVideo(video)
    if (!hit || seen.has(hit.videoId)) continue
    seen.add(hit.videoId)
    hits.push(hit)
    if (hits.length >= limit) break
  }

  return hits
}
