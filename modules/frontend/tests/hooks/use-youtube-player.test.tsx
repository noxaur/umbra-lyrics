import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useYTEmbed } from "@bogdanrn/yt-embed/react"
import {
  PLAYBACK_TIME_POLL_INTERVAL_MS,
  useYouTubePlayer,
} from "@/hooks/use-youtube-player"

vi.mock("@bogdanrn/yt-embed/react", () => ({
  useYTEmbed: vi.fn(),
}))

describe("useYouTubePlayer", () => {
  beforeEach(() => {
    vi.mocked(useYTEmbed).mockReturnValue({
      containerRef: { current: null },
      player: null,
      ready: true,
      currentTime: 5,
      duration: 180,
      isPlaying: true,
      state: 1,
      error: null,
    })
  })

  it("polls playback time frequently enough for smooth lyric handoffs", () => {
    renderHook(() => useYouTubePlayer("video-id"))

    expect(useYTEmbed).toHaveBeenCalledWith(
      "video-id",
      expect.objectContaining({ pollingIntervalMs: PLAYBACK_TIME_POLL_INTERVAL_MS }),
    )
  })
})
