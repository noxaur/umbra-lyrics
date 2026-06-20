import { describe, expect, it } from "vite-plus/test"
import { getLyricsResolverMode } from "@/lib/lyrics-resolver-mode"

describe("getLyricsResolverMode", () => {
  it("defaults to rust", () => {
    expect(getLyricsResolverMode(new URLSearchParams())).toBe("rust")
  })

  it("accepts explicit browser opt-out", () => {
    expect(getLyricsResolverMode(new URLSearchParams("lyricsResolver=browser"))).toBe("browser")
    expect(getLyricsResolverMode(new URLSearchParams("lyricsResolver=legacy"))).toBe("browser")
  })

  it("accepts explicit rust opt-in and env overrides", () => {
    expect(getLyricsResolverMode(new URLSearchParams("lyricsResolver=rust"))).toBe("rust")
    expect(getLyricsResolverMode(new URLSearchParams(), "0")).toBe("browser")
    expect(getLyricsResolverMode(new URLSearchParams(), "1")).toBe("rust")
  })
})
