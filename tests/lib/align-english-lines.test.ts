import { describe, expect, it } from "vitest"
import { alignEnglishLines, distributeLines } from "@/lib/align-english-lines"

describe("distributeLines", () => {
  it("maps fewer English lines across more native slots", () => {
    expect(distributeLines(["A", "B", "C"], 5)).toEqual(["A", "A", "B", "B", "C"])
  })

  it("repeats a single translation across slots", () => {
    expect(distributeLines(["Chorus"], 3)).toEqual(["Chorus", "Chorus", "Chorus"])
  })
})

describe("alignEnglishLines", () => {
  it("preserves blank native rows", () => {
    const native = ["Line one", "", "Line two"]
    const english = ["First", "Second"]
    expect(alignEnglishLines(native, english)).toEqual(["First", "", "Second"])
  })

  it("returns as-is when counts already match", () => {
    const native = ["A", "B"]
    const english = ["One", "Two"]
    expect(alignEnglishLines(native, english)).toEqual(["One", "Two"])
  })

  it("distributes when English has fewer vocal lines", () => {
    const native = ["A", "B", "C", "D"]
    const english = ["One", "Two"]
    expect(alignEnglishLines(native, english)).toEqual(["One", "One", "Two", "Two"])
  })
})
