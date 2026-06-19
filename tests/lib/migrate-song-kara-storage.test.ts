import { beforeEach, describe, expect, it } from "vitest"
import { migrateSongKaraStorage } from "@/lib/migrate-song-kara-storage"

describe("migrateSongKaraStorage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("copies exact keys and removes legacy entries", () => {
    localStorage.setItem("song-kara-theme", "dark")
    localStorage.setItem("song-kara-recent", JSON.stringify([{ videoId: "abc" }]))

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-theme")).toBe("dark")
    expect(localStorage.getItem("song-kara-theme")).toBeNull()
    expect(localStorage.getItem("umbra-recent")).toBe(
      JSON.stringify([{ videoId: "abc" }]),
    )
    expect(localStorage.getItem("umbra-migrated-from-song-kara")).toBe("1")
  })

  it("does not overwrite existing umbra values", () => {
    localStorage.setItem("song-kara-theme", "dark")
    localStorage.setItem("umbra-theme", "light")

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-theme")).toBe("light")
    expect(localStorage.getItem("song-kara-theme")).toBeNull()
  })

  it("migrates prefixed cache keys", () => {
    localStorage.setItem("song-kara-lyrics:abc123", '{"v":10}')
    localStorage.setItem("song-kara-translate:abc123:ja:en", '{"v":1}')

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-lyrics:abc123")).toBe('{"v":10}')
    expect(localStorage.getItem("umbra-translate:abc123:ja:en")).toBe('{"v":1}')
    expect(localStorage.getItem("song-kara-lyrics:abc123")).toBeNull()
  })

  it("runs only once", () => {
    localStorage.setItem("song-kara-theme", "dark")

    migrateSongKaraStorage()
    localStorage.setItem("song-kara-theme", "light")

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-theme")).toBe("dark")
    expect(localStorage.getItem("song-kara-theme")).toBe("light")
  })
})
