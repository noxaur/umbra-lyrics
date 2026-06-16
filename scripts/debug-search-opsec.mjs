import { chromium } from "playwright"

const url = "https://song.opsec.rent/"
console.log(`Testing ${url}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

const apiCalls = []
page.on("response", async (response) => {
  const reqUrl = response.url()
  if (reqUrl.includes("/api/")) {
    let body = ""
    try {
      body = (await response.text()).slice(0, 400)
    } catch {
      body = "<unreadable>"
    }
    apiCalls.push({ url: reqUrl, status: response.status(), body })
  }
})

try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 })
  console.log("goto status:", response?.status())
  console.log("title:", await page.title())

  await page.waitForTimeout(8000)
  console.log("title after wait:", await page.title())

  const input = page.getByPlaceholder("Search songs…")
  const visible = await input.isVisible().catch(() => false)
  console.log("search input visible:", visible)

  if (visible) {
    await input.fill("queen bohemian")
    await page.getByRole("button", { name: /^search$/i }).click()
    await page.waitForTimeout(10000)
    const status = await page.locator("#song-search-status").textContent().catch(() => null)
    const resultCount = await page.locator('[role="option"]').count()
    console.log("status:", status)
    console.log("result count:", resultCount)
  }
} catch (error) {
  console.error("error:", error.message)
}

console.log("api calls:", JSON.stringify(apiCalls, null, 2))
await browser.close()
