#!/usr/bin/env node
import { readFile, mkdtemp, rm } from "node:fs/promises"
import { resolve, join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const legacyBase = process.env.LEGACY_BENCHMARK_BASE_URL ?? process.env.BENCHMARK_BASE_URL ?? "https://song.opsec.rent"
const rustBase = process.env.RUST_BENCHMARK_BASE_URL ?? process.env.BENCHMARK_BASE_URL ?? "https://song.opsec.rent"
const runs = readOption("--runs", "3")
const timeoutMs = readOption("--timeout-ms", "120000")
const outDir = await mkdtemp(join(tmpdir(), "umbra-benchmark-"))
const legacyOutput = resolve(outDir, "legacy.json")
const rustOutput = resolve(outDir, "rust.json")

const legacyRun = spawnSync(
  process.execPath,
  [
    "scripts/benchmark-legacy-lyrics.mjs",
    "--runs",
    runs,
    "--timeout-ms",
    timeoutMs,
    "--output",
    legacyOutput,
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, BENCHMARK_BASE_URL: legacyBase },
    stdio: "inherit",
  },
)
if (legacyRun.status !== 0) process.exit(legacyRun.status ?? 1)

const rustRun = spawnSync(
  process.execPath,
  [
    "scripts/benchmark-rust-lyrics.mjs",
    "--runs",
    runs,
    "--timeout-ms",
    timeoutMs,
    "--output",
    rustOutput,
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, BENCHMARK_BASE_URL: rustBase },
    stdio: "inherit",
  },
)
if (rustRun.status !== 0) process.exit(rustRun.status ?? 1)

const legacy = JSON.parse(await readFile(legacyOutput, "utf8"))
const rust = JSON.parse(await readFile(rustOutput, "utf8"))
const comparison = {
  finalLatencyDeltaMs:
    rust.summary.medianFinalLatencyMs !== null && legacy.summary.medianElapsedMs !== null
      ? rust.summary.medianFinalLatencyMs - legacy.summary.medianElapsedMs
      : null,
  legacyRequestCount: legacy.summary.medianApiCallCount,
  rustRequestCount: rust.summary.medianRequestCount,
}

const report = {
  schemaVersion: 1,
  benchmark: "lyrics-path-comparison",
  generatedAt: new Date().toISOString(),
  legacyBase,
  rustBase,
  runs: Number(runs),
  timeoutMs: Number(timeoutMs),
  legacy,
  rust,
  comparison,
}

console.log(JSON.stringify(report, null, 2))
console.table([
  {
    variant: "legacy",
    medianFinalLatencyMs: legacy.summary.medianElapsedMs,
    medianRequestCount: legacy.summary.medianApiCallCount,
    successRate: legacy.summary.successRate,
  },
  {
    variant: "rust",
    medianFinalLatencyMs: rust.summary.medianFinalLatencyMs,
    medianRequestCount: rust.summary.medianRequestCount,
    successRate: rust.summary.successRate,
  },
])

await rm(outDir, { recursive: true, force: true })
