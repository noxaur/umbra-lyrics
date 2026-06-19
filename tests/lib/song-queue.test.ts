import { beforeEach, describe, expect, it } from "vitest"
import {
  addTrackToQueue,
  clearSongQueue,
  clearSongQueueStorage,
  moveQueueTrack,
  readSongQueue,
  removeTrackFromQueue,
  reorderQueueTracks,
} from "@/lib/song-queue"

const sampleTrack = {
  videoId: "abc123",
  title: "Artist - Song Title",
  artist: "Artist",
  track: "Song Title",
}

const sampleTrack2 = {
  videoId: "def456",
  title: "Other - Another Song",
  artist: "Other",
  track: "Another Song",
}

describe("song-queue", () => {
  beforeEach(() => {
    clearSongQueueStorage()
  })

  it("adds tracks and dedupes by videoId", () => {
    addTrackToQueue(sampleTrack)
    addTrackToQueue(sampleTrack2)
    const duplicate = addTrackToQueue(sampleTrack)

    expect(duplicate.duplicate).toBe(true)
    expect(readSongQueue()).toHaveLength(2)
  })

  it("removes and reorders tracks", () => {
    addTrackToQueue(sampleTrack)
    addTrackToQueue(sampleTrack2)

    removeTrackFromQueue(sampleTrack.videoId)
    expect(readSongQueue()).toHaveLength(1)

    addTrackToQueue(sampleTrack)
    reorderQueueTracks(0, 1)
    expect(readSongQueue().map((t) => t.videoId)).toEqual(["abc123", "def456"])
  })

  it("moves tracks up and down", () => {
    addTrackToQueue(sampleTrack)
    addTrackToQueue(sampleTrack2)

    moveQueueTrack(sampleTrack2.videoId, "up")
    expect(readSongQueue().map((t) => t.videoId)).toEqual(["def456", "abc123"])
  })

  it("clears the queue", () => {
    addTrackToQueue(sampleTrack)
    clearSongQueue()
    expect(readSongQueue()).toEqual([])
  })
})
