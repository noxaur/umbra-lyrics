export type PlaylistImportItem = {
  videoId: string
  title: string
  channel: string
  durationSec: number | null
}

type PlaylistVideoLike = {
  id?: string
  title?: { toString(): string }
  author?: { name?: string }
  duration?: { seconds?: number }
  is_live?: boolean
  is_upcoming?: boolean
}

type PlaylistPanelVideoLike = {
  video_id?: string
  title?: { toString(): string }
  author?: string
  duration?: { seconds?: number }
}

export function mapPlaylistPanelVideo(video: PlaylistPanelVideoLike): PlaylistImportItem | null {
  const videoId = video.video_id?.trim()
  if (!videoId) return null

  const title = video.title?.toString().trim() ?? ""
  const channel = video.author?.trim() ?? ""
  const seconds = video.duration?.seconds
  const durationSec = typeof seconds === "number" && seconds > 0 ? seconds : null

  return {
    videoId,
    title: title || videoId,
    channel,
    durationSec,
  }
}

export function mapPlaylistVideo(video: PlaylistVideoLike): PlaylistImportItem | null {
  const videoId = video.id?.trim()
  if (!videoId) return null
  if (video.is_live || video.is_upcoming) return null

  const title = video.title?.toString().trim() ?? ""
  const channel = video.author?.name?.trim() ?? ""
  const seconds = video.duration?.seconds
  const durationSec = typeof seconds === "number" && seconds > 0 ? seconds : null

  return {
    videoId,
    title: title || videoId,
    channel,
    durationSec,
  }
}
