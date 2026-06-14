import { useEffect, useRef } from "react"
import { LyricLine } from "@/components/lyric-line"
import { usePlayerStore } from "@/stores/player-store"
import { getActiveLineIndex, getWordProgress } from "@/lib/sync-engine"

export function LyricsStage() {
  const status = usePlayerStore((s) => s.status)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const displayMode = usePlayerStore((s) => s.displayMode)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const syncOffsetMs = usePlayerStore((s) => s.syncOffsetMs)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const setActive = usePlayerStore((s) => s.setActive)
  const seekToMs = usePlayerStore((s) => s.seekToMs)
  const activeRef = useRef<HTMLDivElement>(null)

  const timeMs = currentTime * 1000
  const activeIndex = getActiveLineIndex(lyrics, timeMs, syncOffsetMs)

  useEffect(() => {
    const progress =
      activeIndex >= 0 ? getWordProgress(lyrics[activeIndex], timeMs + syncOffsetMs) : 0
    setActive(activeIndex, progress)
  }, [activeIndex, timeMs, syncOffsetMs, lyrics, setActive])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeIndex])

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-3 p-8" aria-busy="true" aria-label="Loading lyrics">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
        ))}
        <p className="text-center text-sm text-muted-foreground">Searching lyrics…</p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        <p>No lyrics found — try editing artist/title</p>
      </div>
    )
  }

  if (lyrics.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        <p>Paste a link to start</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto bg-karaoke-stage-bg px-4 py-12">
      {!lyricsSynced && (
        <p className="mb-4 text-center text-xs text-amber-500/90" role="status">
          No synced lyrics — approximate timing
        </p>
      )}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
        {lyrics.map((line, i) => (
          <div key={`${line.startMs}-${i}`} ref={i === activeIndex ? activeRef : undefined}>
            <LyricLine
              text={line.text}
              englishText={englishLines[i]}
              active={i === activeIndex}
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
