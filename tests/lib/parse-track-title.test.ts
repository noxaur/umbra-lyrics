import { describe, it, expect } from "vitest"
import { parseTrackTitle } from "@/lib/parse-track-title"

describe("parseTrackTitle", () => {
  it("parses artist - track with suffix", () => {
    expect(parseTrackTitle("Fleetwood Mac - The Chain (Official Video)")).toEqual({
      artist: "Fleetwood Mac",
      track: "The Chain",
    })
  })

  it("parses en-dash separator", () => {
    expect(parseTrackTitle("BTS – Dynamite")).toEqual({
      artist: "BTS",
      track: "Dynamite",
    })
  })

  it("parses colon separator", () => {
    expect(parseTrackTitle("Artist: Song Name [Lyrics]")).toEqual({
      artist: "Artist",
      track: "Song Name",
    })
  })

  it("returns whole title as track when no separator", () => {
    expect(parseTrackTitle("SingleTitle")).toEqual({
      artist: "",
      track: "SingleTitle",
    })
  })
})
