#!/usr/bin/env node
/**
 * Record before/after lyric depth-stack videos using handoff-demo.html.
 * "Before" injects the broken perspective placement (perspective on inner child).
 * "After" uses the reference layout (perspective on scroll stage).
 */
import { chromium } from "playwright"
import { copyFile, mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:5173"
const OUT_DIR = path.resolve(process.env.ARTIFACTS_DIR ?? ".artifacts/lyrics-fix")
const BEFORE_OUT = path.join(OUT_DIR, "lyrics-before.webm")
const AFTER_OUT = path.join(OUT_DIR, "lyrics-after.webm")
const REF_OUT = path.join(OUT_DIR, "handoff-reference.webm")

const BROKEN_CSS = `
  .stage { perspective: none !important; overflow-x: clip !important; }
  .inner { perspective: 1200px !important; overflow-x: clip !important; }
  .line { contain: layout paint !important; }
`

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function recordDemo(browser, { label, broken = false }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
    colorScheme: "dark",
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/handoff-demo.html`, { waitUntil: "domcontentloaded" })

  if (broken) {
    await page.addStyleTag({ content: BROKEN_CSS })
  }

  await sleep(14_000)

  const probe = await page.evaluate(() => {
    const stage = document.getElementById("stage")
    const active = [...document.querySelectorAll(".line")].find((b) =>
      b.classList.contains("active"),
    )
    return {
      stagePerspective: stage ? getComputedStyle(stage).perspective : null,
      innerPerspective: getComputedStyle(document.getElementById("inner")).perspective,
      activeTransform: active ? getComputedStyle(active).transform : null,
      activeOpacity: active ? getComputedStyle(active).opacity : null,
    }
  })
  console.log(`${label} probe:`, probe)

  const out =
    label === "before" ? BEFORE_OUT : label === "after" ? AFTER_OUT : REF_OUT
  const video = page.video()
  await page.close()
  await context.close()
  if (video) await copyFile(await video.path(), out)
  console.log("Saved", out)
}

async function postSlack() {
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (!webhook) {
    console.warn("SLACK_WEBHOOK_URL not set — skipping Slack post")
    return false
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: [
        "*Lyrics stage fix — before/after*",
        "Before simulates broken perspective on inner wrapper (flat / clipped depth stack).",
        "After matches `handoff-demo.html` v3 (perspective on scroll stage).",
        `Artifacts: \`${BEFORE_OUT}\`, \`${AFTER_OUT}\`, \`${REF_OUT}\``,
      ].join("\n"),
    }),
  })
  if (!res.ok) throw new Error(`Slack webhook ${res.status}`)
  console.log("Posted Slack summary (upload videos from artifacts folder)")
  return true
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  await recordDemo(browser, { label: "before", broken: true })
  await recordDemo(browser, { label: "after", broken: false })
  await recordDemo(browser, { label: "reference", broken: false })
  await browser.close()
  await postSlack()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
