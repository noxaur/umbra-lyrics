import { describe, expect, it } from "vitest"
import { youtubeErrorMessage } from "@/lib/youtube-errors"

describe("youtubeErrorMessage", () => {
  it("maps embed restriction codes", () => {
    expect(youtubeErrorMessage(101)).toContain("disabled")
    expect(youtubeErrorMessage(150)).toContain("disabled")
    expect(youtubeErrorMessage(153)).toContain("configuration")
  })

  it("falls back for unknown codes", () => {
    expect(youtubeErrorMessage(999, "custom")).toBe("custom")
    expect(youtubeErrorMessage(999)).toBe("YouTube error 999")
  })
})
