/**
 * Live orchestrator smoke test against production API proxy.
 * Run: node scripts/test-orchestrator-live.mjs
 */
import { orchestrateLyricsSearch } from "../modules/frontend/src/lib/lyrics-orchestrator.ts"

const TRACKS = [
  {
    track: "Never Gonna Give You Up",
    artist: "Rick Astley",
    title: "Rick Astley - Never Gonna Give You Up",
    durationSec: 214,
    mustContain: "strangers to love",
  },
  {
    track: "Bohemian Rhapsody",
    artist: "Queen",
    title: "Queen - Bohemian Rhapsody",
    durationSec: 355,
    mustContain: "scaramouche",
  },
]

async function main() {
  for (const t of TRACKS) {
    console.log(`\n=== ${t.artist} - ${t.track} ===`)
    const t0 = Date.now()
    const result = await orchestrateLyricsSearch({
      ...t,
      onProgress: ({ phase, provider }) => console.log(" ", phase, provider ?? ""),
    })
    const ms = Date.now() - t0
    const text =
      result.lyrics?.syncedLyrics ??
      result.lyrics?.plainLyrics ??
      ""
    const ok = text.toLowerCase().includes(t.mustContain)
    console.log({
      ms,
      status: result.status,
      strategy: result.strategy,
      providerId: result.providerId,
      synced: result.synced,
      ok,
      attempts: result.attempts.filter((a) => a.provider === "lrclib"),
      snippet: text.slice(0, 120).replace(/\n/g, " "),
    })
    if (!ok) process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
