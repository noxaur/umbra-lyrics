import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { runLyricsPipeline } from "@/lib/lyrics-pipeline"
import { fetchLyrics } from "@/lib/lyrics-service"
import { pickBestCandidate, scoreCandidate } from "@/lib/lyrics-providers/match-utils"

const FIXTURES = join(import.meta.dirname, "../fixtures/reference-tracks.json")
const apiBase = process.env.LYRICS_API_BASE ?? "https://song.opsec.rent"

type ReferenceTrack = {
  videoId: string
  title: string
  artist: string
  track: string
  language?: string
  durationSec?: number
  mustContain: string[]
}

const tracks = JSON.parse(readFileSync(FIXTURES, "utf8")) as ReferenceTrack[]

const DURATION_BY_VIDEO: Record<string, number> = {
  Ktk_EDLDPeY: 246,
  fJ9rUzIMcZQ: 355,
  kXYiU_JCYtU: 187,
  kJQP7kiw5Fk: 229,
  "9bZkp7q19f0": 253,
  dQw4w9WgXcQ: 214,
}

const SCORING_FIXTURES = [
  {
    label: "JP artist over closer wrong-artist duration",
    results: [
      { trackName: "別世界", artistName: "Kitri", duration: 255, plainLyrics: "wrong" },
      {
        trackName: "別世界 (UnknownDIVA ver.)",
        artistName: "天音かなた",
        duration: 246,
        plainLyrics: "correct",
      },
    ],
    durationSec: 255,
    artist: "天音かなた",
    track: "別世界",
    expectArtist: "天音かなた",
  },
  {
    label: "track over unrelated English hit same duration",
    results: [
      {
        trackName: "Swim",
        artistName: "Kitri",
        duration: 246,
        plainLyrics: "Swim, swim",
      },
      {
        trackName: "別世界",
        artistName: "天音かなた",
        duration: 246,
        plainLyrics: "作詞の空白",
      },
    ],
    durationSec: 246,
    artist: "天音かなた",
    track: "別世界",
    expectTrack: "別世界",
  },
  {
    label: "prefers synced when metadata matches",
    results: [
      {
        trackName: "Song",
        artistName: "Artist",
        duration: 180,
        plainLyrics: "line one",
        syncedLyrics: null,
      },
      {
        trackName: "Song",
        artistName: "Artist",
        duration: 181,
        plainLyrics: "line one",
        syncedLyrics: "[00:00.00] line one",
      },
    ],
    durationSec: 181,
    artist: "Artist",
    track: "Song",
    expectSynced: true,
  },
  {
    label: "feat suffix stripped for track match",
    results: [
      {
        trackName: "Despacito (feat. Daddy Yankee)",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "correct",
      },
      {
        trackName: "Despacito Remix",
        artistName: "Luis Fonsi",
        duration: 229,
        plainLyrics: "wrong",
      },
    ],
    durationSec: 229,
    artist: "Luis Fonsi",
    track: "Despacito",
    expectTrack: "Despacito (feat. Daddy Yankee)",
  },
] as const

describe("lyrics search scoring benchmark", () => {
  it("scores reference fixtures quickly", () => {
    const iterations = 5000
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) {
      for (const fixture of SCORING_FIXTURES) {
        pickBestCandidate(fixture.results, fixture.durationSec, fixture.artist, fixture.track)
      }
    }
    const elapsedMs = performance.now() - t0
    const perPickUs = (elapsedMs * 1000) / (iterations * SCORING_FIXTURES.length)
    console.log(
      JSON.stringify({
        benchmark: "pickBestCandidate",
        iterations,
        fixtures: SCORING_FIXTURES.length,
        elapsedMs: Math.round(elapsedMs * 100) / 100,
        perPickUs: Math.round(perPickUs * 100) / 100,
      }),
    )
    expect(perPickUs).toBeLessThan(500)
  })

  for (const fixture of SCORING_FIXTURES) {
    it(`picks correct match: ${fixture.label}`, () => {
      const best = pickBestCandidate(
        fixture.results,
        fixture.durationSec,
        fixture.artist,
        fixture.track,
      )
      expect(best).not.toBeNull()
      if ("expectArtist" in fixture && fixture.expectArtist) {
        expect(best?.artistName).toBe(fixture.expectArtist)
      }
      if ("expectTrack" in fixture && fixture.expectTrack) {
        expect(best?.trackName).toBe(fixture.expectTrack)
      }
      if ("expectSynced" in fixture && fixture.expectSynced) {
        expect(Boolean(best?.syncedLyrics?.trim())).toBe(true)
      }
    })
  }

  it("reports score spread for debugging", () => {
    const fixture = SCORING_FIXTURES[0]
    const scored = fixture.results.map((r) => ({
      artist: r.artistName,
      score: scoreCandidate(r, fixture.durationSec, fixture.artist, fixture.track),
    }))
    console.log(JSON.stringify({ label: fixture.label, scored }))
    expect(scored[1].score).toBeLessThan(scored[0].score)
  })
})

const LIVE_BENCHMARK_TRACKS = tracks.filter((track) =>
  ["dQw4w9WgXcQ", "fJ9rUzIMcZQ", "Ktk_EDLDPeY"].includes(track.videoId),
)

const runLive = process.env.RUN_LIVE_LYRICS === "1"

describe.runIf(runLive)("lyrics search live benchmark", () => {
  beforeAll(() => {
    vi.stubEnv("VITE_LYRICS_API_BASE", apiBase)
  })

  it(
    "fetchLyrics finds reference tracks with timing",
    async () => {
      const results: Array<Record<string, unknown>> = []

      for (const track of LIVE_BENCHMARK_TRACKS) {
        const t0 = performance.now()
        const result = await fetchLyrics({
          track: track.track,
          artist: track.artist,
          album: "",
          durationSec: track.durationSec ?? DURATION_BY_VIDEO[track.videoId] ?? 200,
        })
        const elapsedMs = Math.round(performance.now() - t0)
        const text = `${result?.plainLyrics ?? ""}\n${result?.syncedLyrics ?? ""}`.toLowerCase()
        const ok = track.mustContain.every((needle) => text.includes(needle.toLowerCase()))

        results.push({
          videoId: track.videoId,
          artist: track.artist,
          track: track.track,
          elapsedMs,
          synced: Boolean(result?.syncedLyrics?.trim()),
          ok,
        })
      }

      console.log(JSON.stringify({ benchmark: "fetchLyrics", results }, null, 2))
      expect(results.every((r) => r.ok)).toBe(true)
    },
    90_000,
  )

  it(
    "orchestrates English tracks with timing",
    async () => {
      const englishTracks = LIVE_BENCHMARK_TRACKS.filter((track) => track.language === "en")
      const results: Array<Record<string, unknown>> = []

      for (const track of englishTracks) {
        const result = await runLyricsPipeline({
          track: track.track,
          artist: track.artist,
          title: track.title,
          durationSec: track.durationSec ?? DURATION_BY_VIDEO[track.videoId] ?? 200,
          providerIds: ["lrclib"],
        })
        const elapsedMs = result.timings.parallelMs
        const text = `${result.native.lyrics?.plainLyrics ?? ""}\n${result.native.lyrics?.syncedLyrics ?? ""}`.toLowerCase()
        const ok = track.mustContain.every((needle) => text.includes(needle.toLowerCase()))

        results.push({
          videoId: track.videoId,
          elapsedMs,
          status: result.native.status,
          providerId: result.native.providerId,
          synced: result.native.synced,
          englishStatus: result.english.status,
          ok,
        })
      }

      console.log(JSON.stringify({ benchmark: "orchestrateLyricsSearch", results }, null, 2))
      expect(results.every((r) => r.ok)).toBe(true)
    },
    90_000,
  )

  it(
    "dual-track pipeline fetches native and English with timing",
    async () => {
      const track = LIVE_BENCHMARK_TRACKS.find((t) => t.videoId === "Ktk_EDLDPeY")
      expect(track).toBeDefined()

      const pipeline = await runLyricsPipeline({
        track: track!.track,
        artist: track!.artist,
        title: track!.title,
        durationSec: DURATION_BY_VIDEO[track!.videoId],
        providerIds: ["lrclib"],
      })

      const nativeText = `${pipeline.native.lyrics?.plainLyrics ?? ""}\n${pipeline.native.lyrics?.syncedLyrics ?? ""}`
      const englishText = pipeline.english.lines.join("\n")

      console.log(
        JSON.stringify(
          {
            benchmark: "dual-track-pipeline",
            videoId: track!.videoId,
            timings: pipeline.timings,
            nativeStatus: pipeline.native.status,
            englishStatus: pipeline.english.status,
            nativeOk: track!.mustContain.every((needle) =>
              nativeText.toLowerCase().includes(needle.toLowerCase()),
            ),
            englishReady: pipeline.english.status === "ready" || pipeline.english.status === "skipped",
          },
          null,
          2,
        ),
      )

      expect(pipeline.native.status).toBe("found")
      expect(pipeline.english.status).toMatch(/ready|skipped/)
      expect(pipeline.timings.parallelMs).toBeLessThan(
        pipeline.timings.nativeMs + pipeline.timings.englishMs + 500,
      )
      expect(
        track!.mustContain.every((needle) => nativeText.toLowerCase().includes(needle.toLowerCase())),
      ).toBe(true)
      if (pipeline.english.status === "ready") {
        expect(englishText.trim().length).toBeGreaterThan(0)
      }
    },
    120_000,
  )
})
