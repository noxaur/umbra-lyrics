import { describe, it, expect } from "vitest"
import {
  parseTrackTitle,
  parseTrackTitleCandidates,
  simplifyTrackName,
  stripChannelSuffix,
  stripDecorativeTitle,
} from "@/lib/parse-track-title"

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

  it("parses pipe title with quoted song by artist", () => {
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

  it("parses anime AMV title with artist and quoted track", () => {
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

  it("uses Topic channel artist when title is track-only", () => {
    expect(parseTrackTitle("Bohemian Rhapsody", "Queen - Topic")).toEqual({
      artist: "Queen",
      track: "Bohemian Rhapsody",
    })
  })

  it("strips trailing - Topic from title", () => {
    expect(parseTrackTitle("Never Gonna Give You Up - Topic", "Rick Astley - Topic")).toEqual({
      artist: "Rick Astley",
      track: "Never Gonna Give You Up",
    })
  })

  it("strips - Topic from artist-track title", () => {
    expect(parseTrackTitle("Queen - Bohemian Rhapsody - Topic", "Queen - Topic")).toEqual({
      artist: "Queen",
      track: "Bohemian Rhapsody",
    })
  })

  it("strips VEVO channel suffix from oEmbed author", () => {
    expect(parseTrackTitle("Single Ladies", "Beyoncé - VEVO")).toEqual({
      artist: "Beyoncé",
      track: "Single Ladies",
    })
  })
})

describe("parseTrackTitleCandidates", () => {
  it("keeps the current parser result first", () => {
    expect(parseTrackTitleCandidates("Fleetwood Mac - The Chain (Official Video)")[0]).toMatchObject({
      artist: "Fleetwood Mac",
      track: "The Chain",
    })
  })

  it("adds swapped artist and title candidates for validation retries", () => {
    const candidates = parseTrackTitleCandidates("Track Name - Artist Name")
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artist: "Artist Name", track: "Track Name" }),
      ]),
    )
  })

  it("adds topic-channel candidates for title-only YouTube Music uploads", () => {
    const candidates = parseTrackTitleCandidates("Bohemian Rhapsody", "Queen - Topic")
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artist: "Queen", track: "Bohemian Rhapsody" }),
      ]),
    )
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

  it("removes trailing - Topic", () => {
    expect(stripDecorativeTitle("Song Name - Topic")).toBe("Song Name")
  })
})

describe("stripChannelSuffix", () => {
  it("removes - Topic suffix", () => {
    expect(stripChannelSuffix("Queen - Topic")).toBe("Queen")
  })

  it("removes - VEVO suffix", () => {
    expect(stripChannelSuffix("Beyoncé - VEVO")).toBe("Beyoncé")
  })
})

describe("simplifyTrackName", () => {
  it("removes remix suffix", () => {
    expect(simplifyTrackName("Song Name (Remix)")).toBe("Song Name")
  })

  it("does not truncate words containing ver", () => {
    expect(simplifyTrackName("Never Gonna Give You Up")).toBe("Never Gonna Give You Up")
  })
})
