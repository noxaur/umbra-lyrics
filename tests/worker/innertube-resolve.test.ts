import { describe, expect, it } from "vitest"
import { INNERTUBE_CLIENT_CHAIN } from "../../worker/lib/innertube-resolve"

describe("innertube-resolve", () => {
  it("exports a client chain with IOS first for audio", () => {
    expect(INNERTUBE_CLIENT_CHAIN[0]).toBe("IOS")
    expect(INNERTUBE_CLIENT_CHAIN).toContain("ANDROID_VR")
    expect(INNERTUBE_CLIENT_CHAIN.length).toBeGreaterThanOrEqual(5)
  })
})
