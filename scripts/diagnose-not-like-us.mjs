import { chromium } from "playwright"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.DEMO_URL ?? "https://song.opsec.rent"
const VIDEO_ID = process.env.VIDEO_ID ?? "H58vbez_m4E"
const OUT_DIR = path.resolve(process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts")

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await context.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("umbra-")) localStorage.removeItem(key)
    }
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/play/${VIDEO_ID}`, { waitUntil: "domcontentloaded", timeout: 120000 })

  for (let i = 0; i < 90; i++) {
    const t = await page.locator("main").innerText()
    if (t.toLowerCase().includes("lrclib") && t.toLowerCase().includes("synced")) break
    await sleep(2000)
  }

  const diag = await page.evaluate(async () => {
    const main = document.querySelector("main")?.textContent ?? ""
    const offsetLabel = document.body.textContent?.match(/(-?\d+\.\d)s offset/)?.[0] ?? "unknown"
    return { header: main.slice(0, 500), offsetLabel }
  })

  // Seek to 0:28 (first vocal ~0:27) via slider
  const slider = page.getByRole("slider", { name: /seek/i })
  await slider.focus()
  // 28/354 ≈ 7.9%
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight")
  await sleep(1500)

  const at28 = await page.locator("main").innerText()
  console.log("Duration from transport:", (await page.locator("text=/\\d+:\\d+/").allInnerTexts()).slice(0, 4))
  console.log("Offset:", diag.offsetLabel)
  console.log("At ~28s main excerpt:\n", at28.split("\n").slice(0, 25).join("\n"))

  await mkdir(OUT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(OUT_DIR, "not-like-us-28s.png"), fullPage: true })
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
