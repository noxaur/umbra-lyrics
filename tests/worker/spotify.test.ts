import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchSpotifyTrack,
  handleSpotifyTrack,
  resetSpotifyTokenCacheForTests,
} from "../../worker/handlers/spotify"
import { handleApiRequest } from "../../worker/router"

const TRACK_ID = "6F5l0oJ5K7pZ2M9bXWnN8P"

const mockTrackResponse = {
  id: TRACK_ID,
  name: "Never Gonna Give You Up",
  duration_ms: 213_000,
  external_ids: { isrc: "USRC17607839" },
  artists: [{ name: "Rick Astley" }],
}

describe("spotify track handler", () => {
  beforeEach(() => {
    resetSpotifyTokenCacheForTests()
    vi.restoreAllMocks()
  })

  it("fetchSpotifyTrack returns mapped track", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }))
      }
      if (url.includes(`/tracks/${TRACK_ID}`)) {
        return new Response(JSON.stringify(mockTrackResponse))
      }
      return new Response(null, { status: 404 })
    })

    const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }
    const track = await fetchSpotifyTrack(TRACK_ID, env)

    expect(track).toEqual({
      id: TRACK_ID,
      name: "Never Gonna Give You Up",
      artist: "Rick Astley",
      durationSec: 213,
      isrc: "USRC17607839",
    })
    expect(fetchMock).toHaveBeenCalled()
  })

  it("fetchSpotifyTrack returns null without credentials", async () => {
    const track = await fetchSpotifyTrack(TRACK_ID, {})
    expect(track).toBeNull()
  })

  it("handleSpotifyTrack returns 400 for missing id", async () => {
    const res = await handleSpotifyTrack("", { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" })
    expect(res.status).toBe(400)
  })

  it("handleSpotifyTrack returns track JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }))
      }
      if (url.includes(`/tracks/${TRACK_ID}`)) {
        return new Response(JSON.stringify(mockTrackResponse))
      }
      return new Response(null, { status: 404 })
    })

    const res = await handleSpotifyTrack(TRACK_ID, {
      SPOTIFY_CLIENT_ID: "id",
      SPOTIFY_CLIENT_SECRET: "secret",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { track: { name: string } }
    expect(body.track.name).toBe("Never Gonna Give You Up")
  })

  it("handleSpotifyTrack returns 404 when track missing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }))
      }
      return new Response(null, { status: 404 })
    })

    const res = await handleSpotifyTrack(TRACK_ID, {
      SPOTIFY_CLIENT_ID: "id",
      SPOTIFY_CLIENT_SECRET: "secret",
    })
    expect(res.status).toBe(404)
  })

  it("is registered on the api router", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }))
      }
      if (url.includes(`/tracks/${TRACK_ID}`)) {
        return new Response(JSON.stringify(mockTrackResponse))
      }
      return new Response(null, { status: 404 })
    })

    const res = await handleApiRequest(
      new Request(`https://song.example/api/metadata/spotify/track?id=${TRACK_ID}`),
      { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" },
    )
    expect(res?.status).toBe(200)
  })
})
