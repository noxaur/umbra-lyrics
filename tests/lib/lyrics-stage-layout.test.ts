import { describe, expect, it } from "vitest"
import { stageEdgeSpacerPx } from "@/lib/lyrics-stage-layout"

describe("stageEdgeSpacerPx", () => {
  it("returns half viewport minus one line height (32px)", () => {
    expect(stageEdgeSpacerPx(400)).toBe(168)
  })

  it("enforces a minimum spacer", () => {
    expect(stageEdgeSpacerPx(120)).toBe(96)
  })
})
