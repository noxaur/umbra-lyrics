import { useCallback, useEffect, useRef, useState } from "react"
import { MotionConfig } from "motion/react"
import { LyricLine } from "@/components/lyric-line"
import { LyricsRetry } from "@/components/lyrics-retry"
import { LyricsSearchProgress } from "@/components/lyrics-search-progress"
import { getScrollBehavior, isOutsideCenterThird } from "@/lib/lyric-scroll"
import { normalizeViewportDistance } from "@/lib/lyric-line-visual"
import { usePlayerStore } from "@/stores/player-store"
import { getActiveLineIndex, getWordProgress } from "@/lib/sync-engine"

type LyricsStageProps = {
  onRetry?: (artist: string, track: string) => void
  onPaste?: (text: string) => void
  videoId?: string
  videoReady?: boolean
}

function idleMessage(videoId: string | undefined, videoReady: boolean | undefined): string {
  if (videoId) {
    if (!videoReady) return "Loading video…"
    return "Preparing player…"
  }
  return "Paste a link to start"
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function LyricsStage({ onRetry, onPaste, videoId, videoReady }: LyricsStageProps) {
  const status = usePlayerStore((s) => s.status)
  const lyricsOutcome = usePlayerStore((s) => s.lyricsOutcome)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const loadedFromCache = usePlayerStore((s) => s.loadedFromCache)
  const setActive = usePlayerStore((s) => s.setActive)
  const setLoadedFromCache = usePlayerStore((s) => s.setLoadedFromCache)
  const seekToMs = usePlayerStore((s) => s.seekToMs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [viewportDistances, setViewportDistances] = useState<number[]>([])
  const [showCacheBadge, setShowCacheBadge] = useState(false)

  const timeMs = currentTime * 1000
  const activeIndex = getActiveLineIndex(lyrics, timeMs, syncOffsetMs)
  const activeLineText = activeIndex >= 0 ? lyrics[activeIndex].text : ""

  const setLineRef = useCallback((index: number) => {
    return (element: HTMLButtonElement | null) => {
      if (element) {
        lineRefs.current.set(index, element)
        if (index === activeIndex) activeRef.current = element
      } else {
        lineRefs.current.delete(index)
      }
    }
  }, [activeIndex])

  useEffect(() => {
    const progress =
      activeIndex >= 0 ? getWordProgress(lyrics[activeIndex], timeMs + syncOffsetMs) : 0
    setActive(activeIndex, progress)
  }, [activeIndex, timeMs, syncOffsetMs, lyrics, setActive])

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
    const container = scrollRef.current
    if (!container || lyrics.length === 0) return

    let rafId = 0
    let scheduled = false

    const measure = () => {
      scheduled = false
      const containerRect = container.getBoundingClientRect()
      const centerY = containerRect.top + containerRect.height / 2
      const firstLine = lineRefs.current.get(0)
      const referenceLineHeight = firstLine?.getBoundingClientRect().height ?? 72
      const next = lyrics.map((_, i) => {
        const element = lineRefs.current.get(i)
        if (!element) return Number.POSITIVE_INFINITY
        const lineRect = element.getBoundingClientRect()
        const lineCenterY = lineRect.top + lineRect.height / 2
        return normalizeViewportDistance(lineCenterY - centerY, referenceLineHeight)
      })
      setViewportDistances((prev) => (arraysEqual(prev, next) ? prev : next))
    }

    const schedule = () => {
      if (scheduled) return
      scheduled = true
      rafId = requestAnimationFrame(measure)
    }

    container.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    measure()

    return () => {
      container.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      cancelAnimationFrame(rafId)
    }
  }, [lyrics.length, activeIndex])

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

  return (
    <div
      ref={scrollRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-karaoke-stage-bg px-4 py-8"
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
      <MotionConfig reducedMotion="user">
        <div
          className="mx-auto w-full max-w-3xl"
          style={{ perspective: "1200px", perspectiveOrigin: "50% 42%" }}
        >
          <div className="flex flex-col gap-1" style={{ transformStyle: "preserve-3d" }}>
            {lyrics.map((line, i) => (
              <LyricLine
                key={`${line.startMs}-${i}`}
                ref={setLineRef(i)}
                text={line.text}
                sectionLabel={line.sectionLabel}
                kind={line.kind}
                englishText={englishLines[i]}
                active={i === activeIndex}
                distanceFromActive={activeIndex >= 0 ? i - activeIndex : i + 8}
                viewportDistance={viewportDistances[i]}
                synced={lyricsSynced}
                progress={i === activeIndex ? getWordProgress(line, timeMs + syncOffsetMs) : 0}
                displayMode={displayMode}
                onSeek={() => seekToMs(line.startMs - syncOffsetMs)}
              />
            ))}
          </div>
        </div>
      </MotionConfig>
    </div>
  )
}
