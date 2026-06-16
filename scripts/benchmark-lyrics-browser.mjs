#!/usr/bin/env node
/**
 * Browser benchmark: lyrics search on the player page with timing logs.
 * Usage: node scripts/benchmark-lyrics-browser.mjs [baseUrl]
 */
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const BASE = process.argv[2] ?? process.env.SEARCH_TEST_URL ?? "https://song.opsec.rent"
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/reference-tracks.json")
const tracks = JSON.parse(readFileSync(FIXTURES, "utf8")).filter((track) =>
  ["dQw4w9WgXcQ", "fJ9rUzIMcZQ"].includes(track.videoId),
)

console.log(`Browser lyrics benchmark @ ${BASE}`)

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
})
const page = await browser.newPage()
page.setDefaultTimeout(180_000)

const apiTimings = []
page.on("response", async (response) => {
  const url = response.url()
  if (!url.includes("/api/lyrics/")) return
  const timing = response.request().timing()
  apiTimings.push({
    path: new URL(url).pathname,
    status: response.status(),
    responseEndMs: timing?.responseEnd ?? null,
  })
})

const results = []

for (const track of tracks) {
  const started = Date.now()
  apiTimings.length = 0

  await page.goto(`${BASE}/play/${track.videoId}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  })

  await page
    .waitForFunction(
      () => {
        const stage = document.querySelector("[data-lyrics-follow]")
        if (!stage) return false
        const lyricButtons = stage.querySelectorAll("button[aria-label*='Seek to']")
        if (lyricButtons.length >= 4) return true
        const status = document.querySelector("[role='status']")?.textContent?.toLowerCase() ?? ""
        return (
          status.includes("no lyrics") ||
          status.includes("paste") ||
          status.includes("not found") ||
          status.includes("instrumental")
        )
      },
      { timeout: 120_000 },
    )
    .catch(() => null)

  const elapsedMs = Date.now() - started
  const lineCount = await page
    .locator("button[aria-label*='Seek to']")
    .count()
    .catch(() => 0)
  const statusText =
    (await page.locator("[role='status']").first().textContent().catch(() => null)) ?? "unknown"
  const status =
    lineCount >= 4 ? "ready" : statusText.toLowerCase().includes("no lyrics") ? "not_found" : "loading"

  results.push({
    videoId: track.videoId,
    artist: track.artist,
    track: track.track,
    elapsedMs,
    status,
    lineCount,
    apiCalls: apiTimings.length,
    apiTimings: apiTimings.slice(0, 8),
  })

  console.log(
    JSON.stringify({
      videoId: track.videoId,
      elapsedMs,
      status,
      lineCount,
      apiCalls: apiTimings.length,
    }),
  )
}

console.log(JSON.stringify({ benchmark: "browser-lyrics-search", base: BASE, results }, null, 2))
await browser.close()

if (results.every((r) => r.status !== "ready" && r.lineCount === 0)) {
  process.exit(1)
}
