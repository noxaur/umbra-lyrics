#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright"
import {
  classifyTerminalState,
  summarizeBenchmark,
} from "./benchmark-legacy-lyrics-lib.mjs"

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_RUNS = 3

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const baseUrl = process.env.BENCHMARK_BASE_URL ?? "https://song.opsec.rent"
const runCount = positiveInteger(readOption("--runs", DEFAULT_RUNS), DEFAULT_RUNS)
const timeoutMs = positiveInteger(
  readOption("--timeout-ms", DEFAULT_TIMEOUT_MS),
  DEFAULT_TIMEOUT_MS,
)
const outputPath = resolve(
  readOption(
    "--output",
    `docs/prototypes/rust-worker/baselines/legacy-lyrics-${new Date()
      .toISOString()
      .slice(0, 10)}.json`,
  ),
)

const referenceTracks = JSON.parse(
  await readFile(new URL("../tests/fixtures/reference-tracks.json", import.meta.url), "utf8"),
)
const lyricsCases = JSON.parse(
  await readFile(new URL("../tests/fixtures/lyrics-cases.json", import.meta.url), "utf8"),
)
const benchmarkCases = [
  ...referenceTracks.map((track) => ({
    ...track,
    caseId: `reference-${track.videoId}`,
    expectedOutcome: "found",
  })),
  ...lyricsCases
    .filter(
      (fixture) =>
        fixture.videoId &&
        fixture.category !== "non_english_output" &&
        fixture.mode !== "live",
    )
    .map((fixture) => ({
      caseId: fixture.id,
      videoId: fixture.videoId,
      artist: fixture.author ?? "",
      track: fixture.title,
      language: fixture.language,
      minLines: fixture.assertions.minimumLines ?? 0,
      mustContain: fixture.assertions.mustContain ?? [],
      mustNotContain: fixture.assertions.forbiddenMarkers ?? [],
      expectedOutcome: fixture.expectedOutcome,
    })),
]

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

function groupApiCalls(apiCalls) {
  return Object.fromEntries(
    [...new Set(apiCalls.map((call) => call.path))]
      .sort((a, b) => a.localeCompare(b))
      .map((path) => [path, apiCalls.filter((call) => call.path === path).length]),
  )
}

async function observeTerminalState(page, track) {
  const deadline = Date.now() + timeoutMs
  let timedOut = false

  while (Date.now() < deadline) {
    const lineCount = await page.locator("button[aria-label*='Seek to']").count()
    const mainText = await page.locator("main").innerText().catch(() => "")
    const normalized = mainText.toLowerCase()
    const hasExpectedText = (track.mustContain ?? []).every((needle) =>
      normalized.includes(needle.toLowerCase()),
    )
    const terminalFailure =
      normalized.includes("no lyrics") ||
      normalized.includes("not found") ||
      normalized.includes("instrumental") ||
      normalized.includes("failed") ||
      normalized.includes("error")

    if ((lineCount >= track.minLines && hasExpectedText) || terminalFailure) {
      return { lineCount, mainText, timedOut }
    }
    await page.waitForTimeout(500)
  }

  timedOut = true
  return {
    lineCount: await page.locator("button[aria-label*='Seek to']").count().catch(() => 0),
    mainText: await page.locator("main").innerText().catch(() => ""),
    timedOut,
  }
}

async function measureTrack(browser, track, run) {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  const page = await context.newPage()
  const apiCalls = []
  const browserErrors = []

  page.on("pageerror", (error) => browserErrors.push(error.message))
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith("/api/")) return
    const timing = response.request().timing()
    apiCalls.push({
      path: url.pathname,
      status: response.status(),
      durationMs:
        timing && timing.responseEnd >= 0
          ? Math.round(timing.responseEnd)
          : null,
    })
  })

  const startedAt = new Date().toISOString()
  const started = performance.now()
  let observation
  let navigationError = null

  try {
    await page.goto(`${baseUrl}/play/${track.videoId}`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    })
    observation = await observeTerminalState(page, track)
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error)
    observation = {
      lineCount: await page.locator("button[aria-label*='Seek to']").count().catch(() => 0),
      mainText: await page.locator("main").innerText().catch(() => ""),
      timedOut: /timeout/i.test(navigationError),
    }
  }

  const elapsedMs = Math.round(performance.now() - started)
  const terminalState = classifyTerminalState({
    lineCount: observation.lineCount,
    statusText: observation.mainText,
    timedOut: observation.timedOut,
  })
  const normalizedText = observation.mainText.toLowerCase()
  const qualityAssertions = {
    minimumLines: observation.lineCount >= track.minLines,
    mustContain: track.mustContain.every((needle) =>
      normalizedText.includes(needle.toLowerCase()),
    ),
    mustNotContain: track.mustNotContain.every(
      (needle) => !normalizedText.includes(needle.toLowerCase()),
    ),
  }
  const expectationMet =
    terminalState === track.expectedOutcome &&
    (terminalState !== "found" || Object.values(qualityAssertions).every(Boolean))

  await context.close()

  return {
    caseId: track.caseId,
    videoId: track.videoId,
    artist: track.artist,
    track: track.track,
    language: track.language,
    run,
    startedAt,
    elapsedMs,
    terminalState,
    synchronized: null,
    renderedLineCount: observation.lineCount,
    apiCallCount: apiCalls.length,
    apiCallsByRoute: groupApiCalls(apiCalls),
    apiCalls,
    qualityAssertions,
    expectationMet,
    timedOut: observation.timedOut,
    navigationError,
    browserErrors,
  }
}

const launchOptions = {
  headless: true,
  ...(process.env.BENCHMARK_BROWSER_CHANNEL === "bundled"
    ? {}
    : { channel: process.env.BENCHMARK_BROWSER_CHANNEL ?? "chrome" }),
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
}
const browser = await chromium.launch(launchOptions)
const browserVersion = browser.version()
const results = []

try {
  for (const track of benchmarkCases) {
    for (let run = 1; run <= runCount; run += 1) {
      const result = await measureTrack(browser, track, run)
      results.push(result)
      console.log(
        [
          result.videoId,
          `run=${run}`,
          `state=${result.terminalState}`,
          `elapsed=${result.elapsedMs}ms`,
          `api=${result.apiCallCount}`,
          `quality=${result.expectationMet ? "pass" : "fail"}`,
        ].join(" "),
      )
    }
  }
} finally {
  await browser.close()
}

const report = {
  schemaVersion: 1,
  benchmark: "legacy-browser-lyrics",
  generatedAt: new Date().toISOString(),
  baseUrl,
  gitCommit: gitCommit(),
  browserVersion,
  corpusVersion: "task-01-v1",
  runCount,
  timeoutMs,
  summary: summarizeBenchmark(results),
  results,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Wrote ${outputPath}`)
console.table(
  results.map((result) => ({
    videoId: result.videoId,
    run: result.run,
    state: result.terminalState,
    elapsedMs: result.elapsedMs,
    apiCalls: result.apiCallCount,
    quality: result.expectationMet ? "pass" : "fail",
  })),
)

if (results.length === 0 || results.some((result) => !result.expectationMet)) {
  process.exitCode = 1
}
