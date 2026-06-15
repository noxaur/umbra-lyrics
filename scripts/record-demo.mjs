import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:4173"
const OUT_DIR = path.resolve("/opt/cursor/artifacts")
const VIDEO_DIR = path.join(OUT_DIR, "demo-videos")
const DEMO_VIDEO = path.join(OUT_DIR, "lyric-sync-demo.webm")

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
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
  const page = await context.newPage()

  console.log("Opening", `${BASE}/play/Ktk_EDLDPeY`)
  await page.goto(`${BASE}/play/Ktk_EDLDPeY`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await sleep(4000)

  // TV mode
  const tvBtn = page.getByRole("button", { name: /TV mode/i })
  if (await tvBtn.isVisible().catch(() => false)) {
    await tvBtn.click({ force: true })
    await sleep(2000)
  }

  // Focus mode
  const focusBtn = page.getByRole("button", { name: /Focus mode/i })
  if (await focusBtn.isVisible().catch(() => false)) {
    await focusBtn.click({ force: true })
    await sleep(2000)
  }

  // Adjust lyrics timing slider
  const slider = page.getByLabel(/Lyrics timing offset/i)
  if (await slider.isVisible().catch(() => false)) {
    await slider.fill("1000")
    await sleep(1500)
    await page.getByRole("button", { name: /Reset lyrics timing/i }).click({ force: true })
    await sleep(1500)
  }

  // Play if paused
  const playBtn = page.getByRole("button", { name: /^Play$/i })
  if (await playBtn.isVisible().catch(() => false)) {
    await playBtn.click()
    await sleep(8000)
  } else {
    await sleep(8000)
  }

  // Exit focus for header badges
  if (await focusBtn.isVisible().catch(() => false)) {
    await focusBtn.click()
    await sleep(2000)
  }

  await sleep(2000)

  const video = page.video()
  await page.close()
  await context.close()
  await browser.close()

  if (video) {
    const recorded = await video.path()
    const { copyFile } = await import("node:fs/promises")
    await copyFile(recorded, DEMO_VIDEO)
    console.log("Saved demo video to", DEMO_VIDEO)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
