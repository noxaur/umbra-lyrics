import { chromium } from "playwright"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const failures = []
page.on("response", (response) => {
  if (response.status() >= 400) {
    failures.push({ url: response.url(), status: response.status() })
  }
})

await page.goto("https://song-kara.nox-heights.workers.dev/", { waitUntil: "networkidle" })

// Debounce-only search (no button click)
await page.getByPlaceholder("Search songs…").fill("yoasobi")
await page.waitForTimeout(1200)
const debouncedStatus = await page.locator("#song-search-status").textContent()
const debouncedCount = await page.locator('[role="option"]').count()
console.log("debounced:", { debouncedStatus, debouncedCount })

// Click first result
if (debouncedCount > 0) {
  await page.locator('[role="option"]').first().click()
  await page.waitForURL(/\/play\//, { timeout: 15000 })
  console.log("navigated to:", page.url())
}

console.log("failures:", failures)
await browser.close()
