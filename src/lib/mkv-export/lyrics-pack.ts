import type { MkvExportInput } from "@/lib/mkv-export/types"
import { buildChapterMarkers, chaptersToFfmetadata } from "@/lib/mkv-export/chapters"
import { englishLinesToSrt } from "@/lib/mkv-export/english-srt"
import { linesToSrt } from "@/lib/mkv-export/srt"
import { languageTagForMkv, sanitizeFilename } from "@/lib/mkv-export/stream-fetch"

export function buildLyricsPackFiles(input: MkvExportInput): Array<{ name: string; content: string }> {
  const nativeSrt = linesToSrt(input.native.lines, input.syncOffsetMs, input.durationMs)
  if (!nativeSrt.trim()) {
    throw new Error("No lyrics available to export")
  }

  const files: Array<{ name: string; content: string }> = [
    { name: "native.srt", content: nativeSrt },
  ]

  if (input.includeEnglish && input.english?.lines.length) {
    const englishSrt = englishLinesToSrt(
      input.native.lines,
      input.english.lines,
      input.syncOffsetMs,
      input.durationMs,
    )
    if (englishSrt.trim()) {
      files.push({ name: "english.srt", content: englishSrt })
    }
  }

  const chapters = buildChapterMarkers(
    input.native.lines,
    input.syncOffsetMs,
    input.durationMs,
  )
  files.push({
    name: "chapters.ffmeta",
    content: chaptersToFfmetadata(chapters, input.durationMs),
  })

  files.push({
    name: "README.txt",
    content: [
      `${input.artist} - ${input.track || input.title}`,
      "",
      "Synced lyrics export from song-kara (beta).",
      "",
      "Files:",
      "- native.srt — original language subtitles",
      "- english.srt — English subtitles (if included)",
      "- chapters.ffmeta — section markers for ffmpeg/VLC",
      "",
      "Mux with your own audio/video using ffmpeg, for example:",
      "  ffmpeg -i your-audio.m4a -i native.srt -i chapters.ffmeta -map 0 -map 1 -map_metadata 2 -map_chapters 2 -c copy output.mkv",
    ].join("\n"),
  })

  return files
}

export async function downloadLyricsPackZip(input: MkvExportInput): Promise<void> {
  const files = buildLyricsPackFiles(input)
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  for (const file of files) {
    zip.file(file.name, file.content)
  }

  const blob = await zip.generateAsync({ type: "blob" })
  const base = sanitizeFilename(`${input.artist}-${input.track || input.title}`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${base}-lyrics.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export function languageLabelForMkv(code: string): string {
  return languageTagForMkv(code)
}
