import { chromium } from "playwright"
import { mkdir, copyFile } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.DEMO_URL ?? "https://song-kara.nox-heights.workers.dev"
const OUT_DIR = path.resolve("/opt/cursor/artifacts")
const VIDEO_DIR = path.join(OUT_DIR, "demo-videos")
const DEMO_VIDEO = path.join(OUT_DIR, "lyrics-pipeline-fix-demo.webm")

const TRACKS = [
  {
    videoId: "dQw4w9WgXcQ",
    label: "Rick Astley - Never Gonna Give You Up",
    mustContain: "strangers to love",
  },
  {
    videoId: "fJ9rUzIMcZQ",
    label: "Queen - Bohemian Rhapsody",
    mustContain: "real life",
  },
]

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function waitForLyricsSource(page, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const text = await page.locator("main").innerText().catch(() => "")
    const lower = text.toLowerCase()
    if (lower.includes("loading lyrics") || lower.includes("searching")) {
      await sleep(2000)
      continue
    }
    const sourceMatch = lower.match(/lrclib|synced|web scrapers|genius|transcription/)
    if (sourceMatch) {
      return { source: sourceMatch[0], header: lower }
    }
    await sleep(2000)
  }
  const header = (await page.locator("main").innerText().catch(() => "")).toLowerCase()
  return { source: "unknown", header }
}

/** Seek past intro — lyric lines are hidden until vocals begin. */
async function seekPastIntro(page) {
  const slider = page.getByRole("slider", { name: /seek/i })
  await slider.focus()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowRight")
  }
  await sleep(500)
}

async function waitForLyrics(page, mustContain, timeoutMs = 120_000) {
  const { source, header } = await waitForLyricsSource(page, timeoutMs)
  await seekPastIntro(page)

  const start = Date.now()
  const needle = mustContain.toLowerCase()
  while (Date.now() - start < timeoutMs) {
    const text = (await page.locator("main").innerText().catch(() => "")).toLowerCase()
    if (text.includes(needle)) {
      return { text, source, header }
    }
    await sleep(1000)
  }
  const text = (await page.locator("main").innerText().catch(() => "")).toLowerCase()
  return { text, source, header }
}

async function main() {
  await mkdir(VIDEO_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
    colorScheme: "dark",
  })

  await context.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("song-kara-")) localStorage.removeItem(key)
    }
  })
  const page = await context.newPage()

  const results = []

  for (const track of TRACKS) {
    console.log(`\n=== Testing ${track.label} ===`)
    await page.goto(`${BASE}/play/${track.videoId}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    })

    await sleep(3000)
    const playBtn = page.getByRole("button", { name: /^Play$/i })
    if (await playBtn.isVisible().catch(() => false)) {
      await playBtn.click()
    }

    const { text: lyricsText, source } = await waitForLyrics(page, track.mustContain)
    const ok = lyricsText.includes(track.mustContain.toLowerCase())
    const hasJunk =
      lyricsText.includes("contributors") ||
      lyricsText.includes("translationsdeutsch") ||
      lyricsText.includes("document.write")

    results.push({ ...track, ok, hasJunk, source, snippet: lyricsText.slice(0, 200) })
    console.log(ok ? "PASS" : "FAIL", "must contain:", track.mustContain, "| source:", source)
    console.log("junk:", hasJunk)
    console.log("snippet:", lyricsText.slice(0, 160).replace(/\n/g, " | "))

    await sleep(6000)
  }

  // Transcribe API smoke
  console.log("\n=== Transcribe API ===")
  const transcribeRes = await page.evaluate(async () => {
    const res = await fetch("/api/lyrics/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: "dQw4w9WgXcQ",
        artist: "Rick Astley",
        track: "Never Gonna Give You Up",
        durationSec: 214,
      }),
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, text: (body.text || "").slice(0, 120), segments: body.segments?.length ?? 0 }
  })
  console.log("transcribe:", transcribeRes)

  await sleep(2000)
  const video = page.video()
  await page.close()
  await context.close()
  await browser.close()

  if (video) {
    const recorded = await video.path()
    await copyFile(recorded, DEMO_VIDEO)
    console.log("\nSaved demo video to", DEMO_VIDEO)
  }

  const allPass = results.every((r) => r.ok && !r.hasJunk)
  console.log("\nSummary:", JSON.stringify({ results, transcribeRes, allPass }, null, 2))
  if (!allPass || transcribeRes.status !== 200) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
