export function percentile(values, ratio) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index]
}

export function summarizeBenchmark(results) {
  const expected = results.filter((result) => result.expectationMet)
  const finalLatency = results.map((result) => result.finalLatencyMs)
  const firstEvent = results.map((result) => result.timeToFirstEventMs)
  const requestCount = results.map((result) => result.requestCount)
  const cacheLatency = results
    .map((result) => result.cacheLatencyMs)
    .filter((value) => typeof value === "number")

  return {
    measuredRuns: results.length,
    successfulRuns: expected.length,
    successRate: results.length === 0 ? 0 : expected.length / results.length,
    medianFirstEventMs: percentile(firstEvent, 0.5),
    medianFinalLatencyMs: percentile(finalLatency, 0.5),
    medianRequestCount: percentile(requestCount, 0.5),
    medianCacheLatencyMs: percentile(cacheLatency, 0.5),
  }
}

export function classifyTerminalState({ hasError, outcome, timedOut, lineCount }) {
  if (hasError) return "error"
  if (outcome === "found" || lineCount > 0) return "found"
  if (outcome === "instrumental") return "instrumental"
  if (outcome === "not_found" || outcome === "empty") return "not_found"
  if (timedOut) return "timeout"
  return outcome === "error" ? "error" : "not_found"
}

