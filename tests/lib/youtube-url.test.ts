import { describe, it, expect } from "vitest"
import {
  extractYouTubeVideoId,
  youTubeMusicWatchUrl,
  youTubeWatchUrl,
} from "@/lib/youtube-url"

describe("extractYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    )
  })

  it("parses youtu.be URLs", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("parses embed URLs", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    )
  })

  it("parses shorts URLs", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    )
  })

  it("accepts bare video id", () => {
    expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for invalid input", () => {
    expect(extractYouTubeVideoId("not-a-url")).toBeNull()
    expect(extractYouTubeVideoId("")).toBeNull()
  })
})

describe("youTubeWatchUrl", () => {
  it("builds a YouTube watch URL", () => {
    expect(youTubeWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
  })
})

describe("youTubeMusicWatchUrl", () => {
  it("builds a YouTube Music watch URL", () => {
    expect(youTubeMusicWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    )
  })
})
