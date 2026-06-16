import { chromium } from "playwright"

const browser = await chromium.launch({
  headless: false,
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
      body: (await response.text()).slice(0, 200),
    })
  }
})

const response = await page.goto("https://song.opsec.rent/", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
})
console.log("goto:", response?.status(), await page.title())
await page.waitForTimeout(15000)
console.log("title after 15s:", await page.title())

const visible = await page.getByPlaceholder("Search songs…").isVisible().catch(() => false)
console.log("search visible:", visible)

if (visible) {
  await page.getByPlaceholder("Search songs…").fill("queen bohemian")
  await page.getByRole("button", { name: /^search$/i }).click()
  await page.waitForTimeout(12000)
  console.log("status:", await page.locator("#song-search-status").textContent().catch(() => null))
  console.log("results:", await page.locator('[role="option"]').count())
}

console.log("api:", JSON.stringify(apiCalls, null, 2))
await browser.close()
