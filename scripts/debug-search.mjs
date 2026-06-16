import { chromium } from "playwright"

const urls = [
  "https://song-kara.nox-heights.workers.dev/",
  "https://song.opsec.rent/",
]

for (const url of urls) {
  console.log(`\n=== ${url} ===`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const apiCalls = []
  page.on("response", async (response) => {
    const reqUrl = response.url()
    if (reqUrl.includes("/api/youtube/search")) {
      let body = ""
      try {
        body = (await response.text()).slice(0, 300)
      } catch {
        body = "<unreadable>"
      }
      apiCalls.push({ url: reqUrl, status: response.status(), body })
    }
  })

  const consoleMessages = []
  page.on("console", (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`))
  page.on("pageerror", (err) => consoleMessages.push(`pageerror: ${err.message}`))

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
    const input = page.getByPlaceholder("Search songs…")
    const visible = await input.isVisible().catch(() => false)
    console.log("search input visible:", visible)
    if (!visible) {
      console.log("title:", await page.title())
      console.log("body snippet:", (await page.textContent("body"))?.slice(0, 200))
      await browser.close()
      continue
    }

    await input.fill("queen bohemian")
    await page.getByRole("button", { name: /^search$/i }).click()
    await page.waitForTimeout(5000)

    const status = await page.locator("#song-search-status").textContent().catch(() => null)
    const resultCount = await page.locator('[role="option"]').count()
    console.log("status:", status)
    console.log("result count:", resultCount)
    console.log("api calls:", JSON.stringify(apiCalls, null, 2))
    if (consoleMessages.length) console.log("console:", consoleMessages.join("\n"))
  } catch (error) {
    console.error("error:", error.message)
    console.log("api calls so far:", JSON.stringify(apiCalls, null, 2))
  }

  await browser.close()
}
