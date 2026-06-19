import { beforeAll, describe, expect, it, vi } from "vitest"
import { parseLrc } from "@/lib/lrc-parser"
import { lrclibProvider } from "@/lib/lyrics-providers/lrclib-provider"
import { parseTrackTitle } from "@/lib/parse-track-title"

const runLive = process.env.RUN_LIVE_LYRICS === "1"
const apiBase = process.env.LYRICS_API_BASE ?? "https://song.opsec.rent"

describe("reported wrong lyrics — title parsing", () => {
  it("parses Cyberpunk Edgerunners Netflix pipe title", () => {
    expect(
      parseTrackTitle(
        'Cyberpunk: Edgerunners | "I Really Want to Stay At Your House" by Rosa Walton | Music Video',
        "Netflix",
      ),
    ).toEqual({
      artist: "Rosa Walton",
      track: "I Really Want to Stay At Your House",
    })
  })

  it("parses Orb AMV Sakanaction Kaiju title", () => {
    expect(
      parseTrackTitle(
        '[SPOILER] [AMV/MAD] Orb : On the Movements of the Earth - Sakanaction "Kaiju" [JP/EN lyrics]',
        "SBG",
      ),
    ).toEqual({
      artist: "Sakanaction",
      track: "Kaiju",
    })
  })
})

const ISSUE_78_TRACKS = [
  {
    videoId: "Rbgw_rduQpM",
    artist: "Rosa Walton",
    track: "I Really Want to Stay at Your House",
    durationSec: 247,
    firstVocalRangeMs: [0, 3_000],
  },
  {
    videoId: "v6y2zfy_YfE",
    artist: "milet",
    track: "Anytime Anywhere",
    durationSec: 231,
    firstVocalRangeMs: [0, 3_000],
  },
  {
    videoId: "BaAFCXwE4ic",
    artist: "LONGMAN",
    track: "spiral",
    durationSec: 233,
    firstVocalRangeMs: [5_000, 10_000],
  },
  {
    videoId: "ukYEgbe2QPw",
    artist: "sakanaction",
    track: "怪獣",
    durationSec: 253,
    firstVocalRangeMs: [0, 3_000],
  },
  {
    videoId: "yyL1h20g8Vs",
    artist: "TK from Ling tosite sigure",
    track: "Unravel (Acoustic Version)",
    durationSec: 229,
    firstVocalRangeMs: [5_000, 10_000],
  },
] as const

describe.runIf(runLive)("issue 78 live synced lyric starts", () => {
  beforeAll(() => {
    vi.stubEnv("VITE_LYRICS_API_BASE", apiBase)
  })

  for (const track of ISSUE_78_TRACKS) {
    it(`uses synced timing for ${track.videoId}`, async () => {
      const candidates = await lrclibProvider.search({
        artist: track.artist,
        track: track.track,
        durationSec: track.durationSec,
        title: `${track.artist} - ${track.track}`,
      })
      const synced = candidates.find((candidate) => candidate.syncedLyrics?.trim())

      expect(synced?.syncedLyrics).toBeTruthy()
      const parsed = parseLrc(synced?.syncedLyrics ?? "", track.durationSec * 1000)
      const firstVocal = parsed.lines.find((line) => line.kind !== "section" && line.text.trim())

      expect(firstVocal?.startMs).toBeGreaterThanOrEqual(track.firstVocalRangeMs[0])
      expect(firstVocal?.startMs).toBeLessThanOrEqual(track.firstVocalRangeMs[1])
    }, 30_000)
  }
})
