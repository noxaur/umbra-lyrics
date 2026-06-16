import { describe, it, expect } from "vitest"
import {
  extractSpotifyTrackId,
  isSpotifyTrackUrl,
  SPOTIFY_TRACK_ID_RE,
} from "@/lib/spotify-url"

const ID = "6F5l0oJ5K7pZ2M9bXWnN8P"

describe("extractSpotifyTrackId", () => {
  it("parses open.spotify.com track URLs", () => {
    expect(extractSpotifyTrackId(`https://open.spotify.com/track/${ID}`)).toBe(ID)
  })

  it("parses track URLs with query params", () => {
    expect(
      extractSpotifyTrackId(`https://open.spotify.com/track/${ID}?si=abc123&nd=1`),
    ).toBe(ID)
  })

  it("parses localized intl track URLs", () => {
    expect(
      extractSpotifyTrackId(`https://open.spotify.com/intl-de/track/${ID}`),
    ).toBe(ID)
    expect(
      extractSpotifyTrackId(`https://open.spotify.com/intl-ja/track/${ID}?si=share`),
    ).toBe(ID)
  })

  it("parses spotify:track URIs", () => {
    expect(extractSpotifyTrackId(`spotify:track:${ID}`)).toBe(ID)
    expect(extractSpotifyTrackId(`SPOTIFY:TRACK:${ID}`)).toBe(ID)
  })

  it("parses bare track IDs", () => {
    expect(extractSpotifyTrackId(ID)).toBe(ID)
  })

  it("rejects invalid input", () => {
    expect(extractSpotifyTrackId("not-a-url")).toBeNull()
    expect(extractSpotifyTrackId("")).toBeNull()
    expect(extractSpotifyTrackId("https://open.spotify.com/album/abc")).toBeNull()
    expect(extractSpotifyTrackId("https://open.spotify.com/playlist/abc")).toBeNull()
    expect(extractSpotifyTrackId("https://spotify.link/abc")).toBeNull()
    expect(extractSpotifyTrackId("https://example.com/track/abc")).toBeNull()
  })
})

describe("isSpotifyTrackUrl", () => {
  it("returns true for Spotify track URLs", () => {
    expect(isSpotifyTrackUrl(`https://open.spotify.com/track/${ID}`)).toBe(true)
    expect(isSpotifyTrackUrl(`spotify:track:${ID}`)).toBe(true)
  })

  it("returns false for bare IDs and non-track URLs", () => {
    expect(isSpotifyTrackUrl(ID)).toBe(false)
    expect(isSpotifyTrackUrl("https://youtube.com/watch?v=abc")).toBe(false)
    expect(isSpotifyTrackUrl("https://open.spotify.com/album/abc")).toBe(false)
  })
})

describe("SPOTIFY_TRACK_ID_RE", () => {
  it("matches 22-char base62 IDs", () => {
    expect(SPOTIFY_TRACK_ID_RE.test(ID)).toBe(true)
    expect(SPOTIFY_TRACK_ID_RE.test("short")).toBe(false)
  })
})
