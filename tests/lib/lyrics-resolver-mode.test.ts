import { describe, expect, it } from "vite-plus/test"
import { getLyricsResolverMode, isRustGatewayAvailable } from "@/lib/lyrics-resolver-mode"

describe("isRustGatewayAvailable", () => {
  it("is true when a lyrics API base is configured", () => {
    expect(isRustGatewayAvailable("http://127.0.0.1:8787", false)).toBe(true)
  })

  it("is true in production without an explicit API base", () => {
    expect(isRustGatewayAvailable(undefined, true)).toBe(true)
  })

  it("is false in dev without an explicit API base", () => {
    expect(isRustGatewayAvailable(undefined, false)).toBe(false)
  })
})

describe("getLyricsResolverMode", () => {
  it("defaults to rust when a rust gateway is available", () => {
    expect(getLyricsResolverMode(new URLSearchParams(), undefined, true)).toBe("rust")
  })

  it("defaults to browser in dev without a rust gateway", () => {
    expect(getLyricsResolverMode(new URLSearchParams(), undefined, false)).toBe("browser")
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
