import { chromium } from "playwright"

const url = process.env.SEARCH_TEST_URL ?? "https://song.opsec.rent/"
console.log(`Testing ${url}`)

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
})
const page = await browser.newPage()

const apiCalls = []
page.on("response", async (response) => {
  if (response.url().includes("/api/youtube/search")) {
    apiCalls.push({
      url: response.url(),
      status: response.status(),
      body: (await response.text()).slice(0, 120),
    })
  }
})

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 })
await page.waitForTimeout(5000)

const visible = await page.getByPlaceholder("Search songs…").isVisible().catch(() => false)
if (!visible) {
  console.error("search input not visible; title:", await page.title())
  process.exit(1)
}

await page.getByPlaceholder("Search songs…").fill("queen bohemian")
await page.getByRole("button", { name: /^search$/i }).click()
await page.waitForTimeout(20000)

const status = await page.locator("#song-search-status").textContent().catch(() => null)
const resultCount = await page.locator('[role="option"]').count()
console.log(JSON.stringify({ status, resultCount, apiCalls }, null, 2))

if (resultCount === 0) {
  process.exit(1)
}

await browser.close()
