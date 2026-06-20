#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { classifyTerminalState, summarizeBenchmark } from "./benchmark-rust-lyrics-lib.mjs"

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
    `docs/prototypes/rust-worker/baselines/rust-lyrics-${new Date()
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
    return process.env.GITHUB_SHA ?? "unknown"
  }
}

function parseTraceData(data) {
  const selectedSource =
    data?.lyrics?.selectedSource ?? data?.metadata?.selectedSource ?? null
  const cacheLatencyMs =
    data?.cache?.status === "hit"
      ? data?.timingsMs?.cacheLookup ?? null
      : data?.timingsMs?.cacheWrite ?? data?.timingsMs?.cacheLookup ?? null

  return {
    selectedSource,
    cacheLatencyMs,
    failureCategory: data?.failureCategory ?? null,
  }
}

async function measureTrack(track, run) {
  const requestBody = JSON.stringify({
    videoId: track.videoId,
    title: track.track,
    author: track.artist,
    duration: track.durationSec,
    language: track.language,
  })

  const startedAt = new Date().toISOString()
  const started = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  let fetchError = null
  try {
    response = await fetch(`${baseUrl}/api/lyrics/resolve`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: requestBody,
      signal: controller.signal,
    })
  } catch (error) {
    fetchError = error
  } finally {
    clearTimeout(timeout)
  }

  const requestCount = 1
  let firstEventMs = null
  let finalLatencyMs = null
  let terminalState = "timeout"
  let selectedSource = null
  let cacheLatencyMs = null
  let failureCategory = null
  let timedOut = false
  let hasError = false
  let lineCount = 0

  if (fetchError) {
    hasError = true
    finalLatencyMs = Math.round(performance.now() - started)
    timedOut =
      fetchError instanceof Error &&
      (fetchError.name === "AbortError" || /timeout|aborted/i.test(fetchError.message))
    terminalState = timedOut ? "timeout" : "error"
    failureCategory =
      fetchError instanceof Error ? fetchError.name || fetchError.message : String(fetchError)
    return {
      caseId: track.caseId,
      videoId: track.videoId,
      artist: track.artist,
      track: track.track,
      language: track.language,
      run,
      startedAt,
      requestCount,
      timeToFirstEventMs: firstEventMs,
      finalLatencyMs,
      terminalState,
      selectedSource,
      cacheLatencyMs,
      failureCategory,
      expectationMet: terminalState === track.expectedOutcome,
      timedOut,
    }
  }

  if (!response.ok) {
    hasError = true
    terminalState = "error"
    finalLatencyMs = Math.round(performance.now() - started)
    failureCategory = `http_${response.status}`
  } else if (!response.body) {
    hasError = true
    terminalState = "error"
    finalLatencyMs = Math.round(performance.now() - started)
    failureCategory = "missing_body"
  } else {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let terminalSeen = false

    const consumeRecord = (record) => {
      let eventName = null
      const dataLines = []
      for (const line of record.split(/\r?\n/)) {
        if (!line || line.startsWith(":")) continue
        if (line.startsWith("event:")) eventName = line.slice(6).trim()
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
      }
      if (!eventName || dataLines.length === 0) return
      const parsed = JSON.parse(dataLines.join("\n"))
      const data = parsed.data ?? {}
      if (firstEventMs === null) {
        firstEventMs = Math.round(performance.now() - started)
      }
      if (eventName === "trace") {
        const trace = parseTraceData(data)
        selectedSource = selectedSource ?? trace.selectedSource
        cacheLatencyMs = cacheLatencyMs ?? trace.cacheLatencyMs
        failureCategory = failureCategory ?? trace.failureCategory
        return
      }
      if (eventName === "candidate" && data.selected && !selectedSource) {
        selectedSource = typeof data.source === "string" ? data.source : null
      }
      if (eventName === "warning" && typeof data.code === "string") {
        failureCategory = failureCategory ?? data.code
      }
      if (eventName === "result") {
        terminalSeen = true
        terminalState = classifyTerminalState({
          hasError,
          outcome: typeof data.outcome === "string" ? data.outcome : null,
          timedOut: false,
          lineCount,
        })
        failureCategory = failureCategory ?? (typeof data.outcome === "string" ? data.outcome : null)
      }
      if (eventName === "error") {
        terminalSeen = true
        hasError = true
        terminalState = "error"
        failureCategory = typeof data.code === "string" ? data.code : "error"
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = findRecordBoundary(buffer)
        while (boundary) {
          consumeRecord(buffer.slice(0, boundary.index))
          buffer = buffer.slice(boundary.index + boundary.length)
          boundary = findRecordBoundary(buffer)
        }
      }
      if (buffer.trim()) consumeRecord(buffer)
      if (!terminalSeen) {
        timedOut = true
        terminalState = "timeout"
      }
    } catch (error) {
      hasError = true
      terminalState = "error"
      failureCategory = failureCategory ?? (error instanceof Error ? error.message : String(error))
    } finally {
      finalLatencyMs = Math.round(performance.now() - started)
    }
  }

  const expectationMet = terminalState === track.expectedOutcome || (track.expectedOutcome === "found" && terminalState === "found")

  return {
    caseId: track.caseId,
    videoId: track.videoId,
    artist: track.artist,
    track: track.track,
    language: track.language,
    run,
    startedAt,
    requestCount,
    timeToFirstEventMs: firstEventMs,
    finalLatencyMs,
    terminalState: classifyTerminalState({
      hasError,
      outcome: terminalState === "error" ? "error" : terminalState,
      timedOut,
      lineCount,
    }),
    selectedSource,
    cacheLatencyMs,
    failureCategory,
    expectationMet,
    timedOut,
  }
}

function findRecordBoundary(buffer) {
  const lf = buffer.indexOf("\n\n")
  const crlf = buffer.indexOf("\r\n\r\n")
  if (lf < 0 && crlf < 0) return null
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { index: crlf, length: 4 }
  return { index: lf, length: 2 }
}

const results = []
for (const track of benchmarkCases) {
  for (let run = 1; run <= runCount; run += 1) {
    const result = await measureTrack(track, run)
    results.push(result)
    console.log(
      [
        result.videoId,
        `run=${run}`,
        `state=${result.terminalState}`,
        `first=${result.timeToFirstEventMs ?? "n/a"}ms`,
        `final=${result.finalLatencyMs}ms`,
        `req=${result.requestCount}`,
        `source=${result.selectedSource ?? "n/a"}`,
        `cache=${result.cacheLatencyMs ?? "n/a"}ms`,
      ].join(" "),
    )
  }
}

const report = {
  schemaVersion: 1,
  benchmark: "rust-sse-lyrics",
  generatedAt: new Date().toISOString(),
  baseUrl,
  gitCommit: gitCommit(),
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
    firstEventMs: result.timeToFirstEventMs,
    finalLatencyMs: result.finalLatencyMs,
    req: result.requestCount,
    source: result.selectedSource ?? "",
    cacheLatencyMs: result.cacheLatencyMs ?? "",
  })),
)
