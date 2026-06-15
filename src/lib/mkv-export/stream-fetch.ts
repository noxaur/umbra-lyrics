import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"
import {
  encodeStreamProxyPath,
  resolveYouTubeStreamInBrowser,
} from "@/lib/mkv-export/youtube-stream-client"

export type StreamFormat = "audio" | "video"

export type StreamInfo = {
  mimeType: string
  streamUrl: string
  format: StreamFormat
  source?: string
}

export async function fetchStreamInfo(
  videoId: string,
  format: StreamFormat,
): Promise<StreamInfo> {
  const fromBrowser = await resolveYouTubeStreamInBrowser(videoId, format)
  if (fromBrowser) {
    return {
      mimeType: fromBrowser.mimeType,
      streamUrl: encodeStreamProxyPath(fromBrowser.url),
      format,
      source: `browser:${fromBrowser.client}`,
    }
  }

  const base = lyricsApiBase()
  const url = `${base}/api/beta/youtube/stream?videoId=${encodeURIComponent(videoId)}&format=${format}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `Stream info failed (${res.status})`)
  }

  const body = (await res.json()) as StreamInfo
  return body
}

export async function fetchStreamBytes(
  streamUrl: string,
  onProgress?: (loaded: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const base = lyricsApiBase()
  const url = streamUrl.startsWith("http") ? streamUrl : `${base}${streamUrl}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Stream download failed (${res.status})`)
  }

  const total = Number(res.headers.get("Content-Length")) || null
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer())
    onProgress?.(buf.byteLength, total)
    return buf
  }

  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.(loaded, total)
    }
  }

  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "song"
}

export function languageTagForMkv(code: string): string {
  const normalized = code.trim().toLowerCase()
  if (!normalized || normalized === "und") return "und"
  return normalized.split("-")[0] ?? normalized
}
