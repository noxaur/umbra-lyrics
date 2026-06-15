import { describe, it, expect } from "vitest"
import { formatDuration, formatLyricTimestamp } from "@/lib/format-time"

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1:30")
    expect(formatDuration(0)).toBe("0:00")
  })

  it("clamps negative values", () => {
    expect(formatDuration(-5)).toBe("0:00")
  })
})

describe("formatLyricTimestamp", () => {
  it("formats LRC-style timestamps", () => {
    expect(formatLyricTimestamp(0)).toBe("00:00.00")
    expect(formatLyricTimestamp(17_120)).toBe("00:17.12")
    expect(formatLyricTimestamp(125_450)).toBe("02:05.45")
  })

  it("clamps negative values", () => {
    expect(formatLyricTimestamp(-100)).toBe("00:00.00")
  })
})
