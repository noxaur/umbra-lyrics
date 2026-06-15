import { describe, it, expect } from "vitest"
import { formatOklch, hexToOklch, oklchStringToHex, parseOklch } from "@/lib/color-oklch"

describe("color-oklch", () => {
  it("parses and formats oklch strings", () => {
    const value = "oklch(0.72 0.28 320)"
    const parsed = parseOklch(value)
    expect(parsed).not.toBeNull()
    expect(formatOklch(parsed!)).toBe(value)
  })

  it("parses oklch with alpha", () => {
    const parsed = parseOklch("oklch(0.5 0.04 280 / 0.7)")
    expect(parsed?.alpha).toBe(0.7)
  })

  it("converts hex to oklch and back", () => {
    const oklch = hexToOklch("#ff0080")
    expect(oklch.l).toBeGreaterThan(0)
    const hex = oklchStringToHex(formatOklch(oklch))
    expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
