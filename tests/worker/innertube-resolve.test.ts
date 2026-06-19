import { describe, expect, it } from "vitest"
import { INNERTUBE_CLIENT_CHAIN } from "../../worker/lib/innertube-resolve"

describe("innertube-resolve", () => {
  it("exports a client chain with IOS first for audio", () => {
    expect(INNERTUBE_CLIENT_CHAIN[0]).toBe("IOS")
    expect(INNERTUBE_CLIENT_CHAIN).toContain("ANDROID_VR")
    expect(INNERTUBE_CLIENT_CHAIN.length).toBeGreaterThanOrEqual(5)
  })

  it("prefers MUSIC before WEB for stream resolution", () => {
    const musicIndex = INNERTUBE_CLIENT_CHAIN.indexOf("MUSIC")
    const webIndex = INNERTUBE_CLIENT_CHAIN.indexOf("WEB")
    expect(musicIndex).toBeGreaterThan(-1)
    expect(webIndex).toBeGreaterThan(-1)
    expect(musicIndex).toBeLessThan(webIndex)
  })
})
