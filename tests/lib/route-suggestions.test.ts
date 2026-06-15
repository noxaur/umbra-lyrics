import { describe, it, expect } from "vitest"
import {
  analyzeRoute,
  isPlayRouteTypo,
  isValidPlayVideoId,
  suggestRoutes,
} from "@/lib/route-suggestions"

const ID = "dQw4w9WgXcQ"

describe("suggestRoutes", () => {
  it("suggests the player when a video ID is in the path", () => {
    const suggestions = suggestRoutes(`/play/${ID}`)
    expect(suggestions[0]).toMatchObject({
      href: `/play/${ID}`,
      label: "Open player",
      videoId: ID,
    })
  })

  it("suggests the player for mistyped play segment with videoId", () => {
    const suggestions = suggestRoutes(`/ply/${ID}`)
    expect(suggestions.some((s) => s.href === `/play/${ID}` && s.videoId === ID)).toBe(true)
  })

  it("suggests themes for /theme typo", () => {
    const suggestions = suggestRoutes("/theme")
    expect(suggestions.some((s) => s.href === "/themes")).toBe(true)
  })

  it("suggests theme builder for /themes/buld", () => {
    const suggestions = suggestRoutes("/themes/buld")
    expect(suggestions.some((s) => s.href === "/themes/build")).toBe(true)
  })

  it("suggests home for unknown paths", () => {
    const suggestions = suggestRoutes("/nowhere-special")
    expect(suggestions.some((s) => s.href === "/")).toBe(true)
    expect(suggestions.some((s) => s.href === "/themes")).toBe(true)
  })

  it("extracts video ID from watch query on a 404 path", () => {
    const suggestions = suggestRoutes("/missing", `?v=${ID}`)
    expect(suggestions.some((s) => s.href === `/play/${ID}` && s.videoId === ID)).toBe(true)
  })

  it("suggests home for bare /watch without video id", () => {
    const suggestions = suggestRoutes("/watch")
    expect(suggestions.some((s) => s.href === "/")).toBe(true)
  })
})

describe("analyzeRoute", () => {
  it("flags invalid video IDs on /play", () => {
    const issue = analyzeRoute("/play/not-a-real-id")
    expect(issue.kind).toBe("invalid_video_id")
    expect(issue.suggestions.some((s) => s.href === "/")).toBe(true)
  })

  it("flags play route typos with valid IDs", () => {
    const issue = analyzeRoute(`/ply/${ID}`)
    expect(issue.kind).toBe("typo")
    expect(issue.suggestions.some((s) => s.href === `/play/${ID}` && s.videoId === ID)).toBe(
      true,
    )
  })

  it("flags /theme as a typo", () => {
    const issue = analyzeRoute("/theme")
    expect(issue.kind).toBe("typo")
    expect(issue.message).toMatch(/themes/i)
  })

  it("returns not_found for unknown paths", () => {
    const issue = analyzeRoute("/nowhere-special")
    expect(issue.kind).toBe("not_found")
    expect(issue.title).toBe("404")
  })
})

describe("route helpers", () => {
  it("validates YouTube IDs", () => {
    expect(isValidPlayVideoId(ID)).toBe(true)
    expect(isValidPlayVideoId("too-short")).toBe(false)
  })

  it("detects play typos", () => {
    expect(isPlayRouteTypo("ply")).toBe(true)
    expect(isPlayRouteTypo("play")).toBe(false)
    expect(isPlayRouteTypo("themes")).toBe(false)
  })
})
