import { describe, expect, it } from "vitest"
import { parseTrackTitle } from "@/lib/parse-track-title"

describe("reported wrong lyrics — title parsing", () => {
  it("parses Cyberpunk Edgerunners Netflix pipe title", () => {
    expect(
      parseTrackTitle(
        'Cyberpunk: Edgerunners | "I Really Want to Stay At Your House" by Rosa Walton | Music Video',
        "Netflix",
      ),
    ).toEqual({
      artist: "Rosa Walton",
      track: "I Really Want to Stay At Your House",
    })
  })

  it("parses Orb AMV Sakanaction Kaiju title", () => {
    expect(
      parseTrackTitle(
        '[SPOILER] [AMV/MAD] Orb : On the Movements of the Earth - Sakanaction "Kaiju" [JP/EN lyrics]',
        "SBG",
      ),
    ).toEqual({
      artist: "Sakanaction",
      track: "Kaiju",
    })
  })
})
