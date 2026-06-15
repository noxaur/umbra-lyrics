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
      ffmpeg.on("log", ({ message }: { message: string }) => onLog?.(message))

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
  if (mimeType.includes("matroska") || mimeType.includes("mkv")) return "mkv"
  return format === "audio" ? "m4a" : "mp4"
}

function extensionForFilename(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] ?? "mp4"
}

type SubtitleBundle = {
  nativeSrt: string
  englishSrt: string | null
  ffmeta: string
  nativeLang: string
}

async function prepareSubtitleBundle(input: MkvExportInput): Promise<SubtitleBundle> {
  const nativeSrt = linesToSrt(input.native.lines, input.syncOffsetMs, input.durationMs)
  if (!nativeSrt.trim()) {
    throw new Error("No lyrics available to export")
  }

  let englishSrt: string | null = null
  if (input.includeEnglish && input.english?.lines.length) {
    const text = englishLinesToSrt(
      input.native.lines,
      input.english.lines,
      input.syncOffsetMs,
      input.durationMs,
    )
    if (text.trim()) englishSrt = text
  }

  const chapters = buildChapterMarkers(
    input.native.lines,
    input.syncOffsetMs,
    input.durationMs,
  )

  return {
    nativeSrt,
    englishSrt,
    ffmeta: chaptersToFfmetadata(chapters, input.durationMs),
    nativeLang: languageTagForMkv(input.native.languageCode),
  }
}

async function writeSubtitleFiles(
  ffmpeg: FFmpeg,
  bundle: SubtitleBundle,
): Promise<{ hasEnglish: boolean }> {
  await ffmpeg.writeFile("native.srt", new TextEncoder().encode(bundle.nativeSrt))
  let hasEnglish = false
  if (bundle.englishSrt) {
    hasEnglish = true
    await ffmpeg.writeFile("english.srt", new TextEncoder().encode(bundle.englishSrt))
  }
  await ffmpeg.writeFile("chapters.ffmeta", new TextEncoder().encode(bundle.ffmeta))
  return { hasEnglish }
}

function buildMuxArgs(
  mediaInput: string,
  hasEnglish: boolean,
  nativeLang: string,
  includeSeparateVideoAudio: boolean,
  audioInput?: string,
): string[] {
  const args: string[] = []

  if (includeSeparateVideoAudio && audioInput) {
    args.push("-i", mediaInput)
    args.push("-i", audioInput)
    args.push("-i", "native.srt")
    if (hasEnglish) args.push("-i", "english.srt")
    args.push("-i", "chapters.ffmeta")
    args.push("-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0")
    if (hasEnglish) args.push("-map", "3:s:0")
    args.push("-map_metadata", hasEnglish ? "4" : "3")
    args.push("-map_chapters", hasEnglish ? "4" : "3")
  } else {
    args.push("-i", mediaInput)
    args.push("-i", "native.srt")
    if (hasEnglish) args.push("-i", "english.srt")
    args.push("-i", "chapters.ffmeta")
    args.push("-map", "0", "-map", "1:s:0")
    if (hasEnglish) args.push("-map", "2:s:0")
    args.push("-map_metadata", hasEnglish ? "3" : "2")
    args.push("-map_chapters", hasEnglish ? "3" : "2")
  }

  args.push("-c", "copy")
  args.push("-metadata:s:s:0", `language=${nativeLang}`)
  if (hasEnglish) args.push("-metadata:s:s:1", "language=eng")
  args.push("output.mkv")
  return args
}

async function runMux(
  ffmpeg: FFmpeg,
  args: string[],
  onProgress?: (stage: MkvExportProgress) => void,
): Promise<Blob> {
  onProgress?.("muxing")
  const exitCode = await ffmpeg.exec(args)
  if (exitCode !== 0) {
    throw new Error(`ffmpeg mux failed (code ${exitCode})`)
  }

  const data = await ffmpeg.readFile("output.mkv")
  onProgress?.("done")
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
  return new Blob([bytes.buffer as ArrayBuffer], { type: "video/x-matroska" })
}

export async function exportMkvFromLocalFile(
  input: MkvExportInput,
  mediaFile: File,
  callbacks: MuxCallbacks = {},
): Promise<Blob> {
  const { onProgress, signal } = callbacks
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError")
  }

  onProgress?.("loading-ffmpeg")
  throwIfAborted()
  const ffmpeg = await getFfmpeg()

  onProgress?.("fetching-media")
  throwIfAborted()

  const ext = extensionForFilename(mediaFile.name)
  const mediaBytes = new Uint8Array(await mediaFile.arrayBuffer())
  await ffmpeg.writeFile(`media.${ext}`, mediaBytes)

  const bundle = await prepareSubtitleBundle(input)
  const { hasEnglish } = await writeSubtitleFiles(ffmpeg, bundle)

  throwIfAborted()
  const args = buildMuxArgs(`media.${ext}`, hasEnglish, bundle.nativeLang, false)
  return runMux(ffmpeg, args, onProgress)
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

  const bundle = await prepareSubtitleBundle(input)
  const { hasEnglish } = await writeSubtitleFiles(ffmpeg, bundle)

  throwIfAborted()
  const args =
    input.includeVideo && videoExt
      ? buildMuxArgs(`video.${videoExt}`, hasEnglish, bundle.nativeLang, true, `audio.${audioExt}`)
      : buildMuxArgs(`audio.${audioExt}`, hasEnglish, bundle.nativeLang, false)

  return runMux(ffmpeg, args, onProgress)
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
