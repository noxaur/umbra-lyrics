import { describe, expect, it } from "vite-plus/test"
import {
  classifyTerminalState,
  percentile,
  summarizeBenchmark,
} from "../../scripts/benchmark-rust-lyrics-lib.mjs"

describe("rust lyrics benchmark reporting", () => {
  it("calculates deterministic aggregate measurements", () => {
    const summary = summarizeBenchmark([
      {
        finalLatencyMs: 100,
        timeToFirstEventMs: 12,
        requestCount: 1,
        cacheLatencyMs: 5,
        expectationMet: true,
      },
      {
        finalLatencyMs: 300,
        timeToFirstEventMs: 30,
        requestCount: 1,
        cacheLatencyMs: 12,
        expectationMet: false,
      },
      {
        finalLatencyMs: 200,
        timeToFirstEventMs: 20,
        requestCount: 1,
        cacheLatencyMs: 8,
        expectationMet: true,
      },
    ])

    expect(summary).toEqual({
      measuredRuns: 3,
      successfulRuns: 2,
      successRate: 2 / 3,
      medianFirstEventMs: 20,
      medianFinalLatencyMs: 200,
      medianRequestCount: 1,
      medianCacheLatencyMs: 8,
    })
    expect(percentile([], 0.5)).toBeNull()
  })

  it("classifies terminal states from observable SSE output", () => {
    expect(
      classifyTerminalState({
        hasError: false,
        outcome: "found",
        timedOut: false,
        lineCount: 5,
      }),
    ).toBe("found")
    expect(
      classifyTerminalState({
        hasError: false,
        outcome: "instrumental",
        timedOut: false,
        lineCount: 0,
      }),
    ).toBe("instrumental")
    expect(
      classifyTerminalState({
        hasError: false,
        outcome: "not_found",
        timedOut: false,
        lineCount: 0,
      }),
    ).toBe("not_found")
    expect(
      classifyTerminalState({
        hasError: false,
        outcome: null,
        timedOut: true,
        lineCount: 0,
      }),
    ).toBe("timeout")
    expect(
      classifyTerminalState({
        hasError: true,
        outcome: null,
        timedOut: false,
        lineCount: 0,
      }),
    ).toBe("error")
  })
})

