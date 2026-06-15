import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"
import { buildChapterMarkers, chaptersToFfmetadata } from "@/lib/mkv-export/chapters"
import { englishLinesToSrt } from "@/lib/mkv-export/english-srt"
import { linesToSrt } from "@/lib/mkv-export/srt"
import {
  fetchStreamBytes,
  fetchStreamInfo,
  languageTagForMkv,
  sanitizeFilename,
} from "@/lib/mkv-export/stream-fetch"
import type { MkvExportInput, MkvExportProgress } from "@/lib/mkv-export/types"

const FFMPEG_CORE_VERSION = "0.12.6"
const FFMPEG_CDN = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null

async function getFfmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance

  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      const ffmpeg = new FFmpeg()
      ffmpeg.on("log", ({ message }) => onLog?.(message))

      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, "application/wasm"),
      })

      ffmpegInstance = ffmpeg
      return ffmpeg
    })()
  }

  return ffmpegLoading
}

export type MuxCallbacks = {
  onProgress?: (stage: MkvExportProgress, detail?: string) => void
  signal?: AbortSignal
}

function extensionForMime(mimeType: string, format: "audio" | "video"): string {
  if (mimeType.includes("webm")) return "webm"
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return format === "audio" ? "m4a" : "mp4"
  if (mimeType.includes("ogg")) return "ogg"
  return format === "audio" ? "m4a" : "mp4"
}

export async function exportMkv(input: MkvExportInput, callbacks: MuxCallbacks = {}): Promise<Blob> {
  const { onProgress, signal } = callbacks
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError")
  }

  onProgress?.("loading-ffmpeg")
  throwIfAborted()
  const ffmpeg = await getFfmpeg()

  onProgress?.("fetching-media")
  throwIfAborted()

  const audioInfo = await fetchStreamInfo(input.videoId, "audio")
  throwIfAborted()
  const audioBytes = await fetchStreamBytes(audioInfo.streamUrl, undefined, signal)
  throwIfAborted()

  const audioExt = extensionForMime(audioInfo.mimeType, "audio")
  await ffmpeg.writeFile(`audio.${audioExt}`, audioBytes)

  let videoExt: string | null = null
  if (input.includeVideo) {
    const videoInfo = await fetchStreamInfo(input.videoId, "video")
    throwIfAborted()
    const videoBytes = await fetchStreamBytes(videoInfo.streamUrl, undefined, signal)
    throwIfAborted()
    videoExt = extensionForMime(videoInfo.mimeType, "video")
    await ffmpeg.writeFile(`video.${videoExt}`, videoBytes)
  }

  const nativeSrt = linesToSrt(input.native.lines, input.syncOffsetMs, input.durationMs)
  if (!nativeSrt.trim()) {
    throw new Error("No lyrics available to export")
  }
  await ffmpeg.writeFile("native.srt", new TextEncoder().encode(nativeSrt))

  let hasEnglish = false
  if (input.includeEnglish && input.english?.lines.length) {
    const englishSrt = englishLinesToSrt(
      input.native.lines,
      input.english.lines,
      input.syncOffsetMs,
      input.durationMs,
    )
    if (englishSrt.trim()) {
      hasEnglish = true
      await ffmpeg.writeFile("english.srt", new TextEncoder().encode(englishSrt))
    }
  }

  const chapters = buildChapterMarkers(
    input.native.lines,
    input.syncOffsetMs,
    input.durationMs,
  )
  const ffmeta = chaptersToFfmetadata(chapters, input.durationMs)
  await ffmpeg.writeFile("chapters.ffmeta", new TextEncoder().encode(ffmeta))

  onProgress?.("muxing")
  throwIfAborted()

  const nativeLang = languageTagForMkv(input.native.languageCode)
  const args: string[] = []

  if (input.includeVideo && videoExt) {
    args.push("-i", `video.${videoExt}`)
    args.push("-i", `audio.${audioExt}`)
    args.push("-i", "native.srt")
    if (hasEnglish) args.push("-i", "english.srt")
    args.push("-i", "chapters.ffmeta")
    args.push("-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0")
    if (hasEnglish) args.push("-map", "3:s:0")
    args.push("-map_metadata", hasEnglish ? "4" : "3")
    args.push("-map_chapters", hasEnglish ? "4" : "3")
    args.push("-c", "copy")
    args.push("-metadata:s:s:0", `language=${nativeLang}`)
    if (hasEnglish) args.push("-metadata:s:s:1", "language=eng")
  } else {
    args.push("-i", `audio.${audioExt}`)
    args.push("-i", "native.srt")
    if (hasEnglish) args.push("-i", "english.srt")
    args.push("-i", "chapters.ffmeta")
    args.push("-map", "0:a:0", "-map", "1:s:0")
    if (hasEnglish) args.push("-map", "2:s:0")
    args.push("-map_metadata", hasEnglish ? "3" : "2")
    args.push("-map_chapters", hasEnglish ? "3" : "2")
    args.push("-c", "copy")
    args.push("-metadata:s:s:0", `language=${nativeLang}`)
    if (hasEnglish) args.push("-metadata:s:s:1", "language=eng")
  }

  args.push("output.mkv")

  const exitCode = await ffmpeg.exec(args)
  if (exitCode !== 0) {
    throw new Error(`ffmpeg mux failed (code ${exitCode})`)
  }

  const data = await ffmpeg.readFile("output.mkv")
  onProgress?.("done")

  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
  return new Blob([bytes.buffer as ArrayBuffer], { type: "video/x-matroska" })
}

export function downloadMkvBlob(blob: Blob, artist: string, track: string): void {
  const base = sanitizeFilename(`${artist}-${track}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${base}.mkv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function preloadFfmpeg(onProgress?: (stage: MkvExportProgress) => void): Promise<void> {
  onProgress?.("loading-ffmpeg")
  await getFfmpeg()
}
