import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearSpotifySession,
  completeSpotifyLogin,
  getSpotifySession,
  spotifyAuthHeaders,
} from "@/lib/spotify-auth"

vi.mock("@/lib/lyrics-providers/api-base", () => ({
  proxyFetch: vi.fn(),
}))

import { proxyFetch } from "@/lib/lyrics-providers/api-base"

const mockProxyFetch = vi.mocked(proxyFetch)

describe("spotify auth client", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockProxyFetch.mockReset()
  })

  it("stores and clears session", () => {
    localStorage.setItem(
      "song-kara:spotify-auth",
      JSON.stringify({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 60_000,
        scope: "user-read-email",
        displayName: "Test User",
        imageUrl: null,
        userId: "user-1",
      }),
    )

    expect(getSpotifySession()?.displayName).toBe("Test User")
    clearSpotifySession()
    expect(getSpotifySession()).toBeNull()
  })

  it("completes login from callback", async () => {
    sessionStorage.setItem(
      "song-kara:spotify-pkce",
      JSON.stringify({
        codeVerifier: "verifier",
        state: "state-1",
        returnPath: "/",
      }),
    )

    mockProxyFetch.mockImplementation(async (path) => {
      if (path === "/api/auth/spotify/token") {
        return new Response(
          JSON.stringify({
            accessToken: "access",
            refreshToken: "refresh",
            expiresIn: 3600,
            scope: "user-read-email",
          }),
        )
      }
      if (path === "/api/auth/spotify/me") {
        return new Response(
          JSON.stringify({
            id: "user-1",
            displayName: "Test User",
            imageUrl: null,
          }),
        )
      }
      return new Response(null, { status: 404 })
    })

    const returnPath = await completeSpotifyLogin("auth-code", "state-1")
    expect(returnPath).toBe("/")
    expect(getSpotifySession()?.accessToken).toBe("access")
    expect(getSpotifySession()?.displayName).toBe("Test User")
  })

  it("builds auth headers when token exists", () => {
    expect(spotifyAuthHeaders("token")).toEqual({ Authorization: "Bearer token" })
    expect(spotifyAuthHeaders(null)).toBeUndefined()
  })
})
