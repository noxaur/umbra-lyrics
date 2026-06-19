import { describe, expect, it } from "vite-plus/test"
import {
  classifyTerminalState,
  percentile,
  summarizeBenchmark,
} from "../../scripts/benchmark-legacy-lyrics-lib.mjs"

describe("legacy lyrics benchmark reporting", () => {
  it("calculates deterministic aggregate measurements", () => {
    const summary = summarizeBenchmark([
      { elapsedMs: 100, apiCallCount: 2, expectationMet: true },
      { elapsedMs: 300, apiCallCount: 6, expectationMet: false },
      { elapsedMs: 200, apiCallCount: 4, expectationMet: true },
    ])

    expect(summary).toEqual({
      measuredRuns: 3,
      successfulRuns: 2,
      successRate: 2 / 3,
      medianElapsedMs: 200,
      p95ElapsedMs: 300,
      medianApiCallCount: 4,
    })
    expect(percentile([], 0.5)).toBeNull()
  })

  it("classifies terminal states from observable page output", () => {
    expect(
      classifyTerminalState({ lineCount: 4, statusText: "", timedOut: false }),
    ).toBe("found")
    expect(
      classifyTerminalState({
        lineCount: 0,
        statusText: "This appears to be instrumental",
        timedOut: false,
      }),
    ).toBe("instrumental")
    expect(
      classifyTerminalState({
        lineCount: 0,
        statusText: "No lyrics found",
        timedOut: false,
      }),
    ).toBe("not_found")
    expect(
      classifyTerminalState({ lineCount: 0, statusText: "", timedOut: true }),
    ).toBe("timeout")
  })
})
