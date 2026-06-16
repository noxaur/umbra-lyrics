import { encodeStreamProxyPath } from "@/lib/mkv-export/youtube-stream-client"
import { resolveYouTubeStreamInBrowser } from "@/lib/mkv-export/youtube-stream-client"
import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"
import type { StreamFormat } from "@/lib/mkv-export/stream-fetch"

export type ResolvedStreamSource = {
  streamUrl: string
  mimeType: string
  source: string
}

/** Browser-first YouTube stream resolution (same strategy as MKV export). */
export async function resolveYouTubeStreamForApi(
  videoId: string,
  format: StreamFormat,
): Promise<ResolvedStreamSource | null> {
  const fromBrowser = await resolveYouTubeStreamInBrowser(videoId, format)
  if (fromBrowser) {
    return {
      mimeType: fromBrowser.mimeType,
      streamUrl: encodeStreamProxyPath(fromBrowser.url),
      source: `browser:${fromBrowser.client}`,
    }
  }

  const base = lyricsApiBase()
  const res = await fetch(
    `${base}/api/beta/youtube/stream?videoId=${encodeURIComponent(videoId)}&format=${format}`,
  )
  if (!res.ok) return null

  const body = (await res.json()) as {
    mimeType: string
    streamUrl: string
    source?: string
  }

  return {
    mimeType: body.mimeType,
    streamUrl: body.streamUrl,
    source: body.source ?? "worker:innertube",
  }
}
