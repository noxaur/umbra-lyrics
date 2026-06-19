import { useCallback, useEffect, useRef, useState } from "react"
import { MotionConfig, useReducedMotion } from "motion/react"
import { LyricLine } from "@/components/lyric-line"
import { LyricsEmptyState } from "@/components/lyrics-empty-state"
import { LyricsRetry } from "@/components/lyrics-retry"
import { LyricsSearchProgress } from "@/components/lyrics-search-progress"
import { Button } from "@/components/ui/button"
import {
  getLineHandoffDurationMs,
  isOutsideCenterThird,
  scrollLineToCenter,
  scrollLineToCenterEase,
} from "@/lib/lyric-scroll"
import {
  decideLyricsResync,
  findNearestLineIndexToCenter,
  isElementCenteredInContainer,
  LYRICS_RESYNC_SNAP_MS,
  wasActiveNearestOnScrollEnd,
} from "@/lib/lyrics-follow-scroll"
import { createRafThrottle } from "@/lib/lyric-viewport-depth"
import { stageEdgeSpacerPx } from "@/lib/lyrics-stage-layout"
import { formatLyricTimestamp } from "@/lib/format-time"
import { getFirstLyricStartMs } from "@/lib/gap-detection"
import { usePlayerStore } from "@/stores/player-store"
import { getLyricStageState } from "@/lib/sync-engine"

type LyricsStageProps = {
  onRetry?: (artist: string, track: string) => void
  onPaste?: (text: string) => void
  onTranscribe?: () => void
  videoId?: string
  videoReady?: boolean
  durationMs?: number
}

function idleMessage(videoId: string | undefined, videoReady: boolean | undefined): string {
  if (videoId) {
    if (!videoReady) return "Loading video…"
    return "Preparing player…"
  }
  return "Paste a link to start"
}

function StagePlaceholder({
  label,
  detail,
}: {
  label: string
  detail?: string | null
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
      <p
        className="text-[clamp(1.25rem,3vw,2.5rem)] font-medium tracking-wide text-muted-foreground/80 motion-safe:animate-pulse motion-reduce:animate-none"
        role="status"
      >
        {label}
      </p>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

export function LyricsStage({
  onRetry,
  onPaste,
  onTranscribe,
  videoId,
  videoReady,
  durationMs = 0,
}: LyricsStageProps) {
  const status = usePlayerStore((s) => s.status)
  const lyricsOutcome = usePlayerStore((s) => s.lyricsOutcome)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const tvMode = usePlayerStore((s) => s.tvMode)
  const showTimestamps = usePlayerStore((s) => s.showTimestamps)
  const loadedFromCache = usePlayerStore((s) => s.loadedFromCache)
  const contentWarning = usePlayerStore((s) => s.contentWarning)
  const verificationScore = usePlayerStore((s) => s.verificationScore)
  const englishStatus = usePlayerStore((s) => s.englishStatus)
  const lyricsFollowMode = usePlayerStore((s) => s.lyricsFollowMode)
  const lyricsScrollSyncRequest = usePlayerStore((s) => s.lyricsScrollSyncRequest)
  const setActive = usePlayerStore((s) => s.setActive)
  const setLoadedFromCache = usePlayerStore((s) => s.setLoadedFromCache)
  const setLyricsFollowMode = usePlayerStore((s) => s.setLyricsFollowMode)
  const requestLyricsScrollSync = usePlayerStore((s) => s.requestLyricsScrollSync)
  const seekToMs = usePlayerStore((s) => s.seekToMs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const lastLineChangeRef = useRef(0)
  const prevDisplayModeRef = useRef(displayMode)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollTimerRef = useRef<number | null>(null)
  const intentionalActiveScrollRef = useRef(false)
  const scrollEndTimerRef = useRef<number | null>(null)
  const [showCacheBadge, setShowCacheBadge] = useState(false)
  const [centerLineIndex, setCenterLineIndex] = useState(0)
  const [lineViewportMetrics, setLineViewportMetrics] = useState<
    Record<number, { distancePx: number; lineHeightPx: number }>
  >({})
  const [edgeSpacerPx, setEdgeSpacerPx] = useState(120)
  const reducedMotion = useReducedMotion()

  const timeMs = currentTime * 1000
  const stage = getLyricStageState(lyrics, timeMs, syncOffsetMs, durationMs)
  const activeIndex = stage.activeIndex
  const activeLineText = activeIndex >= 0 ? lyrics[activeIndex].text : stage.gapLabel ?? ""

  const setLineRef = useCallback(
    (index: number) => (element: HTMLButtonElement | null) => {
      if (element) lineRefs.current.set(index, element)
      else lineRefs.current.delete(index)
      if (index === activeIndex) activeRef.current = element
    },
    [activeIndex],
  )

  const measureCenterLineIndex = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const stageRect = container.getBoundingClientRect()
    const stageCenterY = stageRect.top + stageRect.height / 2
    const centers: Array<{ index: number; centerY: number }> = []
    const metrics: Record<number, { distancePx: number; lineHeightPx: number }> = {}

    lineRefs.current.forEach((element, index) => {
      const rect = element.getBoundingClientRect()
      const centerY = rect.top + rect.height / 2
      metrics[index] = {
        distancePx: Math.abs(centerY - stageCenterY),
        lineHeightPx: rect.height,
      }
      centers.push({ index, centerY })
    })

    setLineViewportMetrics(metrics)

    const next = findNearestLineIndexToCenter(centers, stageCenterY)
    if (next >= 0) setCenterLineIndex(next)
  }, [])

  const finishProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = false
    measureCenterLineIndex()
  }, [measureCenterLineIndex])

  const beginProgrammaticScroll = useCallback(
    (durationMs: number) => {
      if (programmaticScrollTimerRef.current != null) {
        window.clearTimeout(programmaticScrollTimerRef.current)
        programmaticScrollTimerRef.current = null
      }
      programmaticScrollRef.current = true
      if (durationMs > 0) {
        programmaticScrollTimerRef.current = window.setTimeout(() => {
          programmaticScrollTimerRef.current = null
          finishProgrammaticScroll()
        }, durationMs + 32)
        return
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(finishProgrammaticScroll)
      })
    },
    [finishProgrammaticScroll],
  )

  const snapActiveToCenter = useCallback(
    (ease = false) => {
      const element = activeRef.current
      const container = scrollRef.current
      if (!element || !container || activeIndex < 0) return

      if (ease && !reducedMotion) {
        beginProgrammaticScroll(LYRICS_RESYNC_SNAP_MS)
        scrollLineToCenterEase(element, container, LYRICS_RESYNC_SNAP_MS, {
          force: true,
          onTick: measureCenterLineIndex,
        })
        return
      }

      beginProgrammaticScroll(0)
      scrollLineToCenter(element, container, "auto", { force: true })
    },
    [activeIndex, beginProgrammaticScroll, measureCenterLineIndex, reducedMotion],
  )

  const handleScrollEnd = useCallback(() => {
    const container = scrollRef.current
    const activeEl = activeRef.current
    if (!container || activeIndex < 0) return

    const stageRect = container.getBoundingClientRect()
    const stageCenterY = stageRect.top + stageRect.height / 2
    const centers: Array<{ index: number; centerY: number }> = []
    lineRefs.current.forEach((element, index) => {
      const rect = element.getBoundingClientRect()
      centers.push({ index, centerY: rect.top + rect.height / 2 })
    })
    const measuredCenter = findNearestLineIndexToCenter(centers, stageCenterY)
    if (measuredCenter >= 0) setCenterLineIndex(measuredCenter)

    const intentional =
      intentionalActiveScrollRef.current ||
      wasActiveNearestOnScrollEnd(activeIndex, measuredCenter)

    const decision = decideLyricsResync({
      activeIndex,
      centerIndex: measuredCenter,
      activeExactlyCentered: activeEl
        ? isElementCenteredInContainer(activeEl, container)
        : false,
      intentionalActiveScroll: intentional,
    })

    intentionalActiveScrollRef.current = false

    if (decision.action === "resync") {
      setLyricsFollowMode("follow")
      snapActiveToCenter(true)
    }
  }, [activeIndex, setLyricsFollowMode, snapActiveToCenter])

  const onLinePress = useCallback(
    (index: number) => {
      if (index === activeIndex) {
        intentionalActiveScrollRef.current = true
      }
      seekToMs(lyrics[index].startMs - syncOffsetMs)
    },
    [activeIndex, lyrics, seekToMs, syncOffsetMs],
  )

  useEffect(() => {
    setActive(activeIndex, stage.wordProgress)
  }, [activeIndex, stage.wordProgress, setActive])

  const scrollActiveLine = useCallback(
    (force = false, lineChangeIntervalMs?: number) => {
      if (lyricsFollowMode !== "follow") return
      const element = activeRef.current
      const container = scrollRef.current
      if (!element || !container || activeIndex < 0) return

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const durationMs = getLineHandoffDurationMs(prefersReducedMotion, lineChangeIntervalMs)
      beginProgrammaticScroll(durationMs)
      if (durationMs > 0) {
        scrollLineToCenterEase(element, container, durationMs, {
          force,
          onTick: measureCenterLineIndex,
        })
      } else {
        scrollLineToCenter(element, container, "auto", { force })
        measureCenterLineIndex()
      }
    },
    [activeIndex, beginProgrammaticScroll, lyricsFollowMode, measureCenterLineIndex],
  )

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const throttledMeasure = createRafThrottle(measureCenterLineIndex)
    throttledMeasure()

    const onScroll = () => {
      if (!programmaticScrollRef.current && lyricsFollowMode === "follow") {
        setLyricsFollowMode("manual")
      }
      throttledMeasure()
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }
      scrollEndTimerRef.current = window.setTimeout(() => {
        scrollEndTimerRef.current = null
        handleScrollEnd()
      }, 150)
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", throttledMeasure)
    return () => {
      container.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", throttledMeasure)
      if (scrollEndTimerRef.current != null) window.clearTimeout(scrollEndTimerRef.current)
      if (programmaticScrollTimerRef.current != null) {
        window.clearTimeout(programmaticScrollTimerRef.current)
      }
    }
  }, [
    handleScrollEnd,
    lyricsFollowMode,
    lyrics.length,
    measureCenterLineIndex,
    setLyricsFollowMode,
  ])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const updateEdgeSpacer = () => {
      setEdgeSpacerPx(stageEdgeSpacerPx(container.clientHeight))
    }
    updateEdgeSpacer()

    const observer = new ResizeObserver(updateEdgeSpacer)
    observer.observe(container)
    window.addEventListener("resize", updateEdgeSpacer)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateEdgeSpacer)
    }
  }, [lyrics.length, displayMode, tvMode])

  useEffect(() => {
    measureCenterLineIndex()
  }, [lyrics.length, displayMode, measureCenterLineIndex])

  useEffect(() => {
    if (lyricsScrollSyncRequest === 0) return
    snapActiveToCenter(true)
  }, [lyricsScrollSyncRequest, snapActiveToCenter])

  useEffect(() => {
    if (activeIndex < 0 || lyricsFollowMode !== "follow") return

    const now = performance.now()
    const lineChangeIntervalMs =
      lastLineChangeRef.current > 0 ? now - lastLineChangeRef.current : undefined
    lastLineChangeRef.current = now

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => scrollActiveLine(true, lineChangeIntervalMs))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [activeIndex, lyricsFollowMode, scrollActiveLine])

  useEffect(() => {
    if (activeIndex < 0 || lyricsFollowMode !== "follow") return
    if (prevDisplayModeRef.current === displayMode) return
    prevDisplayModeRef.current = displayMode

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => scrollActiveLine(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [displayMode, activeIndex, lyricsFollowMode, scrollActiveLine])

  useEffect(() => {
    const element = activeRef.current
    const container = scrollRef.current
    if (!element || !container || activeIndex < 0 || lyricsFollowMode !== "follow") return

    const observer = new ResizeObserver(() => {
      if (programmaticScrollRef.current) return
      if (!isOutsideCenterThird(element, container)) return
      beginProgrammaticScroll(0)
      scrollLineToCenter(element, container, "auto")
    })
    observer.observe(element)
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeIndex, beginProgrammaticScroll, displayMode, lyricsFollowMode])

  useEffect(() => {
    if (!loadedFromCache) return
    setShowCacheBadge(true)
    const timer = window.setTimeout(() => {
      setShowCacheBadge(false)
      setLoadedFromCache(false)
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [loadedFromCache, setLoadedFromCache])

  if (status === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading lyrics">
        <LyricsEmptyState variant="loading" title="Searching for lyrics…" />
        <div className="px-8 pb-8">
          <LyricsSearchProgress />
        </div>
      </div>
    )
  }

  if (status === "error" && onRetry && onPaste) {
    const variant =
      lyricsOutcome === "network_error"
        ? "network_error"
        : lyricsOutcome === "instrumental"
          ? "instrumental"
          : lyricsOutcome === "partial"
            ? "partial"
            : "not_found"
    return <LyricsRetry onRetry={onRetry} onPaste={onPaste} onTranscribe={onTranscribe} variant={variant} />
  }

  if (status === "error" && onRetry) {
    return <LyricsRetry onRetry={onRetry} onPaste={onPaste ?? (() => {})} />
  }

  if (status === "error") {
    return (
      <LyricsEmptyState
        variant="not_found"
        title="No lyrics found"
        detail="Try editing artist/title or paste lyrics manually."
      />
    )
  }

  if (lyrics.length === 0) {
    const idleVariant = videoId && !videoReady ? "preparing" : videoId ? "preparing" : "idle"
    return (
      <LyricsEmptyState
        variant={idleVariant}
        title={idleMessage(videoId, videoReady)}
        detail={videoId ? "Lyrics will appear here once the track is ready." : "Paste a YouTube or song link to begin."}
      />
    )
  }

  const showPlaceholder = stage.mode === "intro" || stage.mode === "gap" || stage.mode === "outro"
  const firstLyricStartMs = getFirstLyricStartMs(lyrics)
  const placeholderDetail =
    stage.mode === "intro" && firstLyricStartMs != null
      ? `Lyrics start at ${formatLyricTimestamp(firstLyricStartMs - syncOffsetMs)}`
      : null

  return (
    <div
      ref={scrollRef}
      className={cnStage(tvMode)}
      data-tv-mode={tvMode ? "true" : undefined}
      data-lyrics-follow={lyricsFollowMode}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {activeLineText}
      </div>

      {lyricsFollowMode === "manual" ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
          <Button
            type="button"
            size="sm"
            className="pointer-events-auto shadow-md"
            onClick={() => requestLyricsScrollSync()}
          >
            Sync lyrics
          </Button>
        </div>
      ) : null}

      {showCacheBadge && (
        <p
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          role="status"
        >
          Loaded from cache
        </p>
      )}

      {contentWarning ? (
        <p
          className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200/90"
          role="status"
        >
          {contentWarning}
        </p>
      ) : null}

      {verificationScore != null && verificationScore >= 0.6 ? (
        <p
          className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-border bg-background/90 px-2 py-1 text-[0.65rem] text-muted-foreground"
          role="status"
        >
          Verified against audio
        </p>
      ) : null}

      {englishStatus === "loading" && displayMode === "both" ? (
        <p className="pointer-events-none absolute inset-x-3 bottom-3 z-10 text-center text-xs text-muted-foreground motion-safe:animate-pulse">
          Loading English lyrics…
        </p>
      ) : null}

      {showPlaceholder && stage.gapLabel ? (
        <StagePlaceholder label={stage.gapLabel} detail={placeholderDetail} />
      ) : (
        <MotionConfig reducedMotion="user">
          <div
            className="mx-auto w-full max-w-xl overflow-x-clip overflow-y-visible"
            style={{ perspective: "1200px", perspectiveOrigin: "50% 50%" }}
          >
            <div
              className="flex flex-col gap-[0.65rem]"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div aria-hidden className="shrink-0" style={{ height: edgeSpacerPx }} />
              {lyrics.map((line, i) => (
                <LyricLine
                  key={`${line.startMs}-${i}`}
                  ref={setLineRef(i)}
                  text={line.text}
                  words={line.words}
                  sectionLabel={line.sectionLabel}
                  kind={line.kind}
                  startMs={line.startMs - syncOffsetMs}
                  showTimestamp={showTimestamps && line.kind !== "section"}
                  englishText={englishLines[i]}
                  active={i === activeIndex}
                  distanceFromCenter={Math.abs(i - centerLineIndex)}
                  viewportDistancePx={lineViewportMetrics[i]?.distancePx}
                  lineHeightPx={lineViewportMetrics[i]?.lineHeightPx}
                  synced={lyricsSynced}
                  progress={i === activeIndex ? stage.wordProgress : 0}
                  wordIndex={i === activeIndex ? stage.wordIndex : -1}
                  displayMode={displayMode}
                  tvMode={tvMode}
                  onSeek={() => onLinePress(i)}
                />
              ))}
              <div aria-hidden className="shrink-0" style={{ height: edgeSpacerPx }} />
            </div>
          </div>
        </MotionConfig>
      )}
    </div>
  )
}

function cnStage(tvMode: boolean) {
  return [
    "relative flex w-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-py-10",
    "max-h-full",
    tvMode ? "tv-mode" : "",
  ].join(" ")
}
