import { chromium } from "playwright"
import { mkdir, copyFile } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.DEMO_URL ?? "https://song.opsec.rent"
const OUT_DIR = path.resolve("/opt/cursor/artifacts")
const DEMO_VIDEO = path.join(OUT_DIR, "lyrics-pipeline-fix-demo.webm")

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: path.join(OUT_DIR, "demo-videos"), size: { width: 1280, height: 800 } },
    colorScheme: "dark",
  })

  await context.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("umbra-")) localStorage.removeItem(key)
    }
    localStorage.setItem("umbra-show-timestamps", "false")
    localStorage.setItem("umbra-tv-mode", "true")
  })

  const page = await context.newPage()
  console.log("Opening Rick Astley on", BASE)
  await page.goto(`${BASE}/play/dQw4w9WgXcQ`, { waitUntil: "domcontentloaded", timeout: 120_000 })

  // Wait for LRCLIB synced lyrics
  for (let i = 0; i < 60; i++) {
    const text = (await page.locator("main").innerText()).toLowerCase()
    if (text.includes("lrclib") && text.includes("synced")) break
    await sleep(2000)
  }

  // Intro at 0:00 — should show only intro placeholder, not lyric stack
  await sleep(2000)
  const introShot = await page.locator("main").innerText()
  console.log("At intro:", introShot.includes("Intro") ? "Intro placeholder visible" : "no intro")

  // Seek to first vocal line (~0:19) and play
  const slider = page.getByRole("slider", { name: /seek/i })
  await slider.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await sleep(500)

  const playBtn = page.getByRole("button", { name: /^Play$/i })
  if (await playBtn.isVisible().catch(() => false)) await playBtn.click()

  // Wait until active lyric visible
  for (let i = 0; i < 30; i++) {
    const text = (await page.locator("main").innerText()).toLowerCase()
    if (text.includes("strangers to love")) break
    await sleep(1000)
  }

  await sleep(8000)

  const finalText = (await page.locator("main").innerText()).toLowerCase()
  console.log("Final check:", {
    lrclib: finalText.includes("lrclib"),
    synced: finalText.includes("synced"),
    lyric: finalText.includes("strangers to love"),
    junk: finalText.includes("contributors"),
  })

  await page.screenshot({ path: path.join(OUT_DIR, "lyrics-demo-final.png"), fullPage: true })

  const video = page.video()
  await page.close()
  await context.close()
  await browser.close()

  if (video) {
    await copyFile(await video.path(), DEMO_VIDEO)
    console.log("Saved", DEMO_VIDEO)
  }

  if (!finalText.includes("strangers to love") || finalText.includes("contributors")) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
