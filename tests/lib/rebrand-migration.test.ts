import { beforeEach, describe, expect, it } from "vitest"
import {
  migrateSongKaraStorage,
  REBRAND_MIGRATION_KEY,
} from "@/lib/rebrand-migration"
import { PLAYLISTS_STORAGE_KEY } from "@/lib/playlists"
import { THEME_CACHE_KEY } from "@/lib/themes"

describe("migrateSongKaraStorage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("copies exact keys and prefixed cache entries once", () => {
    localStorage.setItem(
      "song-kara-playlists",
      JSON.stringify([{ id: "playlist-1", name: "Favorites", tracks: [] }]),
    )
    localStorage.setItem(
      "song-kara-theme-cache",
      JSON.stringify({ catalogVersion: 2, id: "gruvbox-dark-hard", category: "dark", tokens: {} }),
    )
    localStorage.setItem("song-kara-lyrics:abc12345678", JSON.stringify({ version: 10 }))

    migrateSongKaraStorage()

    expect(localStorage.getItem(PLAYLISTS_STORAGE_KEY)).toContain("playlist-1")
    expect(localStorage.getItem(THEME_CACHE_KEY)).toContain("gruvbox-dark-hard")
    expect(localStorage.getItem("umbra-lyrics:abc12345678")).toContain("\"version\":10")
    expect(localStorage.getItem("song-kara-playlists")).toBeNull()
    expect(localStorage.getItem("song-kara-theme-cache")).toBeNull()
    expect(localStorage.getItem("song-kara-lyrics:abc12345678")).toBeNull()
    expect(localStorage.getItem(REBRAND_MIGRATION_KEY)).toBe("1")
  })

  it("does not overwrite existing umbra keys", () => {
    localStorage.setItem("song-kara-recent", JSON.stringify([{ videoId: "old" }]))
    localStorage.setItem("umbra-recent", JSON.stringify([{ videoId: "new" }]))

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-recent")).toContain("new")
    expect(localStorage.getItem("song-kara-recent")).toBeNull()
  })

  it("is idempotent after the migration marker is set", () => {
    localStorage.setItem(REBRAND_MIGRATION_KEY, "1")
    localStorage.setItem("song-kara-queue", JSON.stringify({ tracks: [] }))

    migrateSongKaraStorage()

    expect(localStorage.getItem("umbra-queue")).toBeNull()
    expect(localStorage.getItem("song-kara-queue")).toContain("tracks")
  })
})
