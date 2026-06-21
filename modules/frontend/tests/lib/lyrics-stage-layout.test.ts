import { describe, expect, it } from "vitest"
import {
  DEFAULT_LYRIC_LINE_HEIGHT_PX,
  stageEdgeSpacerPx,
} from "@/lib/lyrics-stage-layout"

describe("stageEdgeSpacerPx", () => {
  it("returns half viewport minus half the default line height", () => {
    expect(stageEdgeSpacerPx(400)).toBe(178)
  })

  it("uses a measured line height when provided", () => {
    expect(stageEdgeSpacerPx(400, 64)).toBe(168)
  })

  it("does not enforce a large minimum on short stages", () => {
    expect(stageEdgeSpacerPx(120)).toBe(38)
  })

  it("documents the default line height estimate", () => {
    expect(DEFAULT_LYRIC_LINE_HEIGHT_PX).toBe(44)
  })
})
