import { describe, it, expect } from "vitest"
import { parseTrackTitle, simplifyTrackName, stripDecorativeTitle } from "@/lib/parse-track-title"

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

  it("parses Japanese MV title as track - artist", () => {
    expect(parseTrackTitle("【Original Anime MV】別世界 - 天音かなた【ホロライブ】")).toEqual({
      artist: "天音かなた",
      track: "別世界",
    })
  })

  it("parses bare Japanese track - artist title", () => {
    expect(parseTrackTitle("別世界 - 天音かなた")).toEqual({
      artist: "天音かなた",
      track: "別世界",
    })
  })

  it("swaps when oEmbed author matches trailing segment", () => {
    expect(parseTrackTitle("別世界 - 天音かなた", "天音かなた Official")).toEqual({
      artist: "天音かなた",
      track: "別世界",
    })
  })

  it("strips feat suffix from track", () => {
    expect(parseTrackTitle("Artist - Song Name (feat. Guest)")).toEqual({
      artist: "Artist",
      track: "Song Name",
    })
  })
})

describe("stripDecorativeTitle", () => {
  it("removes fullwidth brackets", () => {
    expect(stripDecorativeTitle("【Original Anime MV】別世界 - 天音かなた【ホロライブ】")).toBe(
      "別世界 - 天音かなた",
    )
  })

  it("removes corner quotes and fullwidth parens", () => {
    expect(stripDecorativeTitle("「MV」別世界（TV size） - 天音かなた")).toBe("別世界 - 天音かなた")
  })
})

describe("simplifyTrackName", () => {
  it("removes remix suffix", () => {
    expect(simplifyTrackName("Song Name (Remix)")).toBe("Song Name")
  })
})
