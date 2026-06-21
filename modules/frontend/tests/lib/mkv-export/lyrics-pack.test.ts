import { describe, expect, it } from "vitest"
import { buildLyricsPackFiles } from "@/lib/mkv-export/lyrics-pack"
import type { LyricLine } from "@/types/lyrics"

const lines: LyricLine[] = [
  { startMs: 1000, endMs: 3000, text: "Hello", kind: "lyric" },
  { startMs: 3000, endMs: 5000, text: "World", kind: "lyric" },
]

describe("buildLyricsPackFiles", () => {
  it("builds srt and chapter files", () => {
    const files = buildLyricsPackFiles({
      videoId: "abc",
      title: "Title",
      artist: "Artist",
      track: "Track",
      durationMs: 10_000,
      syncOffsetMs: 0,
      native: { languageCode: "en", lines },
      includeVideo: false,
      includeEnglish: false,
    })

    expect(files.some((f) => f.name === "native.srt" && f.content.includes("Hello"))).toBe(true)
    expect(files.some((f) => f.name === "chapters.ffmeta" && f.content.includes(";FFMETADATA1"))).toBe(
      true,
    )
    expect(files.some((f) => f.name === "README.txt")).toBe(true)
  })
})
