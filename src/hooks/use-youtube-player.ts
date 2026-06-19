import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useYTEmbed } from "@bogdanrn/yt-embed/react"
import { youtubeErrorMessage } from "@/lib/youtube-errors"

type UseYouTubePlayerOptions = {
  onEnded?: () => void
}

/** yt-embed defaults to 250ms; lyric sync reads this via rAF so a lower cadence reduces handoff lag. */
export const PLAYBACK_TIME_POLL_INTERVAL_MS = 50

export function useYouTubePlayer(videoId: string, options: UseYouTubePlayerOptions = {}) {
  const { onEnded } = options
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const origin = typeof window !== "undefined" ? window.location.origin : ""

  const playerVars = useMemo(
    () => ({
      origin,
      enablejsapi: 1 as const,
      playsinline: 1 as const,
      rel: 0 as const,
    }),
    [origin],
  )

  const { containerRef, player, ready, currentTime, duration, isPlaying, error } =
    useYTEmbed(videoId, {
      playerVars,
      pollingIntervalMs: PLAYBACK_TIME_POLL_INTERVAL_MS,
    })

  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  useEffect(() => {
    if (!player) return

    const onAutoplayBlocked = () => setAutoplayBlocked(true)
    const onState = (event: Event) => {
      const state = (event as CustomEvent<{ state: number }>).detail.state
      if (state === 1) setAutoplayBlocked(false)
      if (state === 0) onEndedRef.current?.()
    }

    player.addEventListener("autoplayblocked", onAutoplayBlocked)
    player.addEventListener("statechange", onState)
    return () => {
      player.removeEventListener("autoplayblocked", onAutoplayBlocked)
      player.removeEventListener("statechange", onState)
    }
  }, [player])

  useEffect(() => {
    if (!player || !ready) return
    const iframe = player.iframe
    if (!iframe) return
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin")
  }, [player, ready])

  const play = useCallback(() => {
    if (!player) return
    setAutoplayBlocked(false)
    void player.playVideo({ awaitState: true }).catch(() => {
      setAutoplayBlocked(true)
    })
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

  const resolvedError = error
    ? {
        code: error.code,
        message: youtubeErrorMessage(error.code, error.message),
      }
    : null

  const playbackHint =
    resolvedError || isPlaying
      ? null
      : autoplayBlocked
        ? "Click Play to start"
        : ready && duration > 0 && !isPlaying
          ? "Click Play to start"
          : null

  return {
    containerRef,
    ready,
    currentTime,
    duration,
    isPlaying,
    error: resolvedError,
    playbackHint,
    play,
    pause,
    seekTo,
    getVideoTitle,
  }
}
