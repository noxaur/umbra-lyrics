import { describe, it, expect } from "vitest"
import { suggestRoutes } from "@/lib/route-suggestions"

const ID = "dQw4w9WgXcQ"

describe("suggestRoutes", () => {
  it("suggests the player when a video ID is in the path", () => {
    const suggestions = suggestRoutes(`/play/${ID}`)
    expect(suggestions[0]).toMatchObject({
      href: `/play/${ID}`,
      label: "Open player",
    })
  })

  it("suggests the player for mistyped play segment", () => {
    const suggestions = suggestRoutes(`/ply/${ID}`)
    expect(suggestions.some((s) => s.href === `/play/${ID}`)).toBe(true)
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
    expect(suggestions.some((s) => s.href === `/play/${ID}`)).toBe(true)
  })

  it("suggests home for bare /watch without video id", () => {
    const suggestions = suggestRoutes("/watch")
    expect(suggestions.some((s) => s.href === "/")).toBe(true)
  })
})
