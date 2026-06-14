import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { LyricLine } from "@/components/lyric-line"
import { LyricsRetry } from "@/components/lyrics-retry"
import { LyricsSearchProgress } from "@/components/lyrics-search-progress"
import { getScrollBehavior, isOutsideCenterThird } from "@/lib/lyric-scroll"
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
  const activeRef = useRef<HTMLDivElement>(null)
  const [showCacheBadge, setShowCacheBadge] = useState(false)

  const timeMs = currentTime * 1000
  const activeIndex = getActiveLineIndex(lyrics, timeMs, syncOffsetMs)

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
      <div className="flex flex-1 flex-col gap-3 p-8" aria-busy="true" aria-label="Loading lyrics">
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
      className="relative flex flex-1 flex-col overflow-y-auto bg-karaoke-stage-bg px-4 py-12"
    >
      {showCacheBadge && (
        <p
          className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          role="status"
        >
          Loaded from cache
        </p>
      )}
      <div className="mb-4 flex flex-col items-center gap-2">
        {!lyricsSynced && lyrics.length > 0 && (
          <div
            className="flex max-w-lg items-start justify-center gap-2 px-2 text-sm text-foreground/90"
            role="status"
          >
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>
              No synced lyrics — approximate timing. Use <span className="font-medium">±0.5s</span>{" "}
              below to adjust.
            </p>
          </div>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
        {lyrics.map((line, i) => (
          <div key={`${line.startMs}-${i}`} ref={i === activeIndex ? activeRef : undefined}>
            <LyricLine
              text={line.text}
              englishText={englishLines[i]}
              active={i === activeIndex}
              synced={lyricsSynced}
              progress={i === activeIndex ? getWordProgress(line, timeMs + syncOffsetMs) : 0}
              displayMode={displayMode}
              onSeek={() => seekToMs(line.startMs - syncOffsetMs)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
