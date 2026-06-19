export function percentile(values, ratio) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index]
}

export function summarizeBenchmark(results) {
  const expected = results.filter((result) => result.expectationMet)
  const elapsed = results.map((result) => result.elapsedMs)
  const apiCalls = results.map((result) => result.apiCallCount)

  return {
    measuredRuns: results.length,
    successfulRuns: expected.length,
    successRate: results.length === 0 ? 0 : expected.length / results.length,
    medianElapsedMs: percentile(elapsed, 0.5),
    p95ElapsedMs: percentile(elapsed, 0.95),
    medianApiCallCount: percentile(apiCalls, 0.5),
  }
}

export function classifyTerminalState({ lineCount, statusText, timedOut }) {
  if (lineCount > 0) return "found"
  const normalized = statusText.toLowerCase()
  if (normalized.includes("instrumental")) return "instrumental"
  if (normalized.includes("no lyrics") || normalized.includes("not found")) {
    return "not_found"
  }
  if (timedOut) return "timeout"
  if (normalized.includes("error") || normalized.includes("failed")) return "error"
  return "error"
}
