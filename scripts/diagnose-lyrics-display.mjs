import { chromium } from "playwright"

const BASE = process.env.DEMO_URL ?? "https://umbra.nox-heights.workers.dev"
const VIDEO_ID = process.env.VIDEO_ID ?? "dQw4w9WgXcQ"

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" })
  await context.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("umbra-")) localStorage.removeItem(key)
    }
  })
  const page = await context.newPage()

  await page.goto(`${BASE}/play/${VIDEO_ID}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await sleep(5000)

  // Wait for LRCLIB
  for (let i = 0; i < 60; i++) {
    const header = await page.locator("main").innerText()
    if (header.toLowerCase().includes("lrclib") && header.toLowerCase().includes("strangers")) break
    await sleep(2000)
  }

  const playBtn = page.getByRole("button", { name: /^Play$/i })
  if (await playBtn.isVisible().catch(() => false)) await playBtn.click()
  await sleep(3000)

  const diagnosis = await page.evaluate(() => {
    const main = document.querySelector("main")
    const buttons = [...document.querySelectorAll("main button")]
      .map((b) => b.textContent?.trim() ?? "")
      .filter((t) => t.length > 0)

    const lyricButtons = buttons.filter(
      (t) =>
        !/^(play|pause|seek|tv mode|focus|view|mkv|beta|retry|back|reset|−|\+|0\.0s)/i.test(t) &&
        !/^\d+:\d+/.test(t) &&
        t.length > 2,
    )

    return {
      mainText: main?.innerText?.slice(0, 2000) ?? "",
      allButtons: buttons.slice(0, 40),
      lyricButtons: lyricButtons.slice(0, 25),
      badge: document.body.innerText.match(/(LRCLIB|Synced|Auto-timed|Genius|web scrapers)/gi),
    }
  })

  console.log("=== BADGE ===", diagnosis.badge)
  console.log("\n=== LYRIC BUTTONS (first 25) ===")
  diagnosis.lyricButtons.forEach((l, i) => console.log(`${i + 1}. ${l}`))

  console.log("\n=== SUSPICIOUS ===")
  const suspicious = diagnosis.lyricButtons.filter((l) =>
    /contributors|translations|українська|russian\)|^\d{2}:\d{2}/i.test(l),
  )
  console.log(suspicious.length ? suspicious : "(none)")

  // Fetch what LRCLIB returns for this track
  const lrclib = await page.evaluate(async () => {
    const q = new URLSearchParams({
      track_name: "Never Gonna Give You Up",
      artist_name: "Rick Astley",
    })
    const res = await fetch(`/api/lyrics/lrclib/search?${q}`)
    const data = await res.json()
    const hit = data.find((r) => r.syncedLyrics?.includes("strangers to love")) ?? data[0]
    const synced = hit?.syncedLyrics ?? ""
    const lines = synced
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 12)
    return { id: hit?.id, lines, syncedStart: synced.slice(0, 400) }
  })

  console.log("\n=== LRCLIB SYNCED (first 12 lines) ===")
  lrclib.lines.forEach((l, i) => console.log(`${i + 1}. ${l}`))

  await page.screenshot({ path: "/opt/cursor/artifacts/lyrics-display-debug.png", fullPage: true })
  console.log("\nScreenshot: /opt/cursor/artifacts/lyrics-display-debug.png")

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
