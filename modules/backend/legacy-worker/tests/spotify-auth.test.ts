import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleSpotifyAuthConfig,
  handleSpotifyAuthMe,
  handleSpotifyAuthRefresh,
  handleSpotifyAuthToken,
} from "../src/handlers/spotify-auth"
import { handleApiRequest } from "../src/router"

const env = {
  SPOTIFY_CLIENT_ID: "client-id",
  SPOTIFY_CLIENT_SECRET: "client-secret",
}

describe("spotify auth handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns auth config", async () => {
    const res = handleSpotifyAuthConfig(env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { clientId: string; scopes: string }
    expect(body.clientId).toBe("client-id")
    expect(body.scopes).toContain("user-read-email")
  })

  it("exchanges authorization code for tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        )
      }
      return new Response(null, { status: 404 })
    })

    const res = await handleSpotifyAuthToken(
      new Request("https://song.example/api/auth/spotify/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "auth-code",
          code_verifier: "verifier",
          redirect_uri: "https://song.example/auth/spotify/callback",
        }),
      }),
      env,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { accessToken: string; refreshToken: string }
    expect(body.accessToken).toBe("access")
    expect(body.refreshToken).toBe("refresh")
  })

  it("refreshes access tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/token")) {
        return new Response(
          JSON.stringify({
            access_token: "new-access",
            expires_in: 3600,
          }),
        )
      }
      return new Response(null, { status: 404 })
    })

    const res = await handleSpotifyAuthRefresh(
      new Request("https://song.example/api/auth/spotify/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: "refresh" }),
      }),
      env,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { accessToken: string }
    expect(body.accessToken).toBe("new-access")
  })

  it("proxies spotify profile", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          display_name: "Rick Astley",
          images: [{ url: "https://example.com/avatar.jpg" }],
        }),
      ),
    )

    const res = await handleSpotifyAuthMe(
      new Request("https://song.example/api/auth/spotify/me", {
        headers: { Authorization: "Bearer access" },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { displayName: string; imageUrl: string }
    expect(body.displayName).toBe("Rick Astley")
    expect(body.imageUrl).toBe("https://example.com/avatar.jpg")
  })

  it("registers auth routes on the api router", async () => {
    const configRes = await handleApiRequest(
      new Request("https://song.example/api/auth/spotify/config"),
      env,
    )
    expect(configRes?.status).toBe(200)
  })
})
