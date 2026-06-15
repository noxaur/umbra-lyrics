import { useCallback, useEffect, useRef, useState } from "react"
import { MotionConfig } from "motion/react"
import { LyricLine } from "@/components/lyric-line"
import { LyricsRetry } from "@/components/lyrics-retry"
import { LyricsSearchProgress } from "@/components/lyrics-search-progress"
import { getScrollBehavior, isOutsideCenterThird } from "@/lib/lyric-scroll"
import { usePlayerStore } from "@/stores/player-store"
import { getLyricStageState } from "@/lib/sync-engine"

type LyricsStageProps = {
  onRetry?: (artist: string, track: string) => void
  onPaste?: (text: string) => void
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

function StagePlaceholder({ label }: { label: string }) {
  return (
    <p
      className="py-8 text-center text-[clamp(1.25rem,3vw,2.5rem)] font-medium tracking-wide text-muted-foreground/80 motion-safe:animate-pulse motion-reduce:animate-none"
      role="status"
    >
      {label}
    </p>
  )
}

export function LyricsStage({ onRetry, onPaste, videoId, videoReady, durationMs = 0 }: LyricsStageProps) {
  const status = usePlayerStore((s) => s.status)
  const lyricsOutcome = usePlayerStore((s) => s.lyricsOutcome)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const tvMode = usePlayerStore((s) => s.tvMode)
  const loadedFromCache = usePlayerStore((s) => s.loadedFromCache)
  const setActive = usePlayerStore((s) => s.setActive)
  const setLoadedFromCache = usePlayerStore((s) => s.setLoadedFromCache)
  const seekToMs = usePlayerStore((s) => s.seekToMs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [showCacheBadge, setShowCacheBadge] = useState(false)

  const timeMs = currentTime * 1000
  const stage = getLyricStageState(lyrics, timeMs, syncOffsetMs, durationMs)
  const activeIndex = stage.activeIndex
  const activeLineText = activeIndex >= 0 ? lyrics[activeIndex].text : stage.gapLabel ?? ""

  const setLineRef = useCallback(
    (index: number) => (element: HTMLButtonElement | null) => {
      if (index === activeIndex) activeRef.current = element
    },
    [activeIndex],
  )

  useEffect(() => {
    setActive(activeIndex, stage.wordProgress)
  }, [activeIndex, stage.wordProgress, setActive])

  useEffect(() => {
    const element = activeRef.current
    const container = scrollRef.current
    if (!element || !container || activeIndex < 0) return
    if (!isOutsideCenterThird(element, container)) return

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    element.scrollIntoView({
      block: "center",
      behavior: getScrollBehavior(prefersReducedMotion),
    })
  }, [activeIndex])

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
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-8" aria-busy="true" aria-label="Loading lyrics">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
        ))}
        <LyricsSearchProgress />
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
    return <LyricsRetry onRetry={onRetry} onPaste={onPaste} variant={variant} />
  }

  if (status === "error" && onRetry) {
    return <LyricsRetry onRetry={onRetry} onPaste={onPaste ?? (() => {})} />
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        <p role="status">No lyrics found — try editing artist/title</p>
      </div>
    )
  }

  if (lyrics.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground"
        aria-busy={Boolean(videoId && !videoReady)}
      >
        <p>{idleMessage(videoId, videoReady)}</p>
      </div>
    )
  }

  const showPlaceholder = stage.mode === "intro" || stage.mode === "gap" || stage.mode === "outro"

  return (
    <div
      ref={scrollRef}
      className={cnStage(tvMode)}
      data-tv-mode={tvMode ? "true" : undefined}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {activeLineText}
      </div>

      {showCacheBadge && (
        <p
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          role="status"
        >
          Loaded from cache
        </p>
      )}

      {showPlaceholder && stage.gapLabel ? <StagePlaceholder label={stage.gapLabel} /> : null}

      <MotionConfig reducedMotion="user">
        <div
          className="mx-auto w-full max-w-3xl overflow-x-hidden"
          style={{ perspective: "1200px", perspectiveOrigin: "50% 42%" }}
        >
          <div
            className="flex flex-col gap-1.5 sm:gap-2"
            style={{ transformStyle: "preserve-3d" }}
          >
            {lyrics.map((line, i) => (
              <LyricLine
                key={`${line.startMs}-${i}`}
                ref={setLineRef(i)}
                text={line.text}
                words={line.words}
                sectionLabel={line.sectionLabel}
                kind={line.kind}
                englishText={englishLines[i]}
                active={i === activeIndex}
                distanceFromActive={activeIndex >= 0 ? i - activeIndex : i + 8}
                synced={lyricsSynced}
                progress={i === activeIndex ? stage.wordProgress : 0}
                wordIndex={i === activeIndex ? stage.wordIndex : -1}
                displayMode={displayMode}
                tvMode={tvMode}
                onSeek={() => seekToMs(line.startMs - syncOffsetMs)}
              />
            ))}
          </div>
        </div>
      </MotionConfig>
    </div>
  )
}

function cnStage(tvMode: boolean) {
  return [
    "relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain scroll-py-8 bg-karaoke-stage-bg px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8",
    tvMode ? "tv-mode" : "",
  ].join(" ")
}
