import { chromium } from "playwright"

const BASE = process.env.DEMO_URL ?? "https://song-kara.nox-heights.workers.dev"
const VIDEO_ID = process.env.VIDEO_ID ?? "dQw4w9WgXcQ"

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark",
  })
  await context.addInitScript(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith("song-kara-")) localStorage.removeItem(key)
    }
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/play/${VIDEO_ID}`, { waitUntil: "domcontentloaded", timeout: 120_000 })

  for (let i = 0; i < 60; i++) {
    const t = await page.locator("main").innerText()
    if (t.toLowerCase().includes("strangers")) break
    await sleep(2000)
  }

  const playBtn = page.getByRole("button", { name: /^Play$/i })
  if (await playBtn.isVisible().catch(() => false)) await playBtn.click()
  await sleep(4000)

  const styles = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const tokens = {
      karaokeActiveLine: root.getPropertyValue("--karaoke-active-line").trim(),
      karaokeMuted: root.getPropertyValue("--karaoke-muted").trim(),
      karaokeUnsung: root.getPropertyValue("--karaoke-unsung").trim(),
      karaokeStageBg: root.getPropertyValue("--karaoke-stage-bg").trim(),
      theme: document.documentElement.getAttribute("data-theme"),
      dark: document.documentElement.classList.contains("dark"),
    }

    const buttons = [...document.querySelectorAll("main button")].filter((b) => {
      const t = b.textContent?.trim() ?? ""
      return t.length > 8 && !/play|pause|seek|tv|focus|view|mkv|beta|retry|back|reset|offset/i.test(t)
    })

    const active = buttons.find((b) => b.getAttribute("aria-current") === "true")
    const sample = buttons.slice(0, 8).map((b) => {
      const cs = getComputedStyle(b)
      const text = b.querySelector("span.font-semibold") ?? b
      const tcs = getComputedStyle(text)
      return {
        text: (b.textContent ?? "").trim().slice(0, 50),
        ariaCurrent: b.getAttribute("aria-current"),
        transform: cs.transform,
        opacity: cs.opacity,
        filter: cs.filter,
        color: cs.color,
        fontSize: tcs.fontSize,
        textColor: tcs.color,
        textShadow: cs.textShadow,
      }
    })

    const perspective = document.querySelector("[style*='perspective']")
    return {
      tokens,
      activeFound: Boolean(active),
      activeText: active?.textContent?.trim().slice(0, 60),
      sample,
      perspective: perspective ? getComputedStyle(perspective).perspective : null,
    }
  })

  console.log(JSON.stringify(styles, null, 2))
  await page.screenshot({ path: "/opt/cursor/artifacts/lyric-visual-debug.png", fullPage: true })
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
