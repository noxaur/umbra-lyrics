import { useCallback } from "react"
import { useYTEmbed } from "@bogdanrn/yt-embed/react"

export function useYouTubePlayer(videoId: string) {
  const { containerRef, player, ready, currentTime, duration, isPlaying, error } =
    useYTEmbed(videoId)

  const play = useCallback(() => {
    void player?.playVideo()
  }, [player])

  const pause = useCallback(() => {
    void player?.pauseVideo()
  }, [player])

  const seekTo = useCallback(
    (seconds: number) => {
      void player?.seekTo(seconds, true)
    },
    [player],
  )

  const getVideoTitle = useCallback(async (): Promise<string> => {
    if (!player) return ""
    try {
      const data = (await player.getVideoData()) as { title?: string }
      return data?.title ?? ""
    } catch {
      return ""
    }
  }, [player])

  return {
    containerRef,
    ready,
    currentTime,
    duration,
    isPlaying,
    error,
    play,
    pause,
    seekTo,
    getVideoTitle,
  }
}
