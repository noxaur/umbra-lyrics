import { forwardRef, useState } from "react"
import {
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from "motion/react"
import { KaraokeWordProgress } from "@/components/karaoke-word-progress"
import { formatLyricTimestamp } from "@/lib/format-time"
import {
  getLyricLineVisual,
  getLyricLineVisualFromViewport,
} from "@/lib/lyric-line-visual"
import { cn } from "@/lib/utils"
import type { LyricWord } from "@/types/lyrics"

type LyricLineProps = {
  text: string
  words?: LyricWord[]
  romajiText?: string
  englishText?: string
  sectionLabel?: string
  kind?: "lyric" | "section"
  startMs?: number
  showTimestamp?: boolean
  active: boolean
  distanceFromCenter: number
  viewportDistancePx?: number
  lineHeightPx?: number
  progress: number
  wordIndex?: number
  synced: boolean
  displayMode: "native" | "romaji" | "english" | "native-romaji" | "both" | "all"
  tvMode?: boolean
  onSeek?: () => void
}

const LINE_SIZE = "w-full max-w-xl lyrics-primary-size leading-snug"
const TV_LINE_SIZE =
  "max-w-full lyrics-tv-primary-size leading-snug lg:lyrics-tv-primary-lg-size"
const LINE_TEXT =
  "block w-full max-w-full break-words [overflow-wrap:anywhere] text-balance hyphens-auto"
const SECTION_LABEL_CLASS =
  "block py-1 text-center lyrics-section-label-size font-medium tracking-wide text-muted-foreground"

function WordProgressText({
  text,
  progress,
  activeLine = false,
}: {
  text: string
  progress: number
  activeLine?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const smoothProgress = useSpring(progress, {
    stiffness: 160,
    damping: 28,
    mass: 0.45,
    restDelta: 0.001,
  })

  if (reducedMotion) {
    return (
      <KaraokeWordProgress
        text={text}
        progress={progress}
        tone={activeLine ? "active-line" : "default"}
      />
    )
  }

  return (
    <SmoothKaraokeProgress text={text} progress={smoothProgress} activeLine={activeLine} />
  )
}

function SmoothKaraokeProgress({
  text,
  progress,
  activeLine = false,
}: {
  text: string
  progress: ReturnType<typeof useSpring>
  activeLine?: boolean
}) {
  const [value, setValue] = useState(() => progress.get())
  useMotionValueEvent(progress, "change", setValue)

  return (
    <KaraokeWordProgress
      text={text}
      progress={value}
      tone={activeLine ? "active-line" : "default"}
    />
  )
}

function PerWordText({
  words,
  wordIndex,
  progress,
}: {
  words: LyricWord[]
  wordIndex: number
  progress: number
}) {
  return (
    <span className="inline">
      {words.map((w, i) => {
        const isPast = i < wordIndex
        const isActive = i === wordIndex
        if (isPast) {
          return (
            <span key={`${w.startMs}-${i}`} className="text-karaoke-active-line">
              {w.text}{" "}
            </span>
          )
        }
        if (isActive) {
          return (
            <span key={`${w.startMs}-${i}`} className="inline">
              <WordProgressText text={w.text} progress={progress} activeLine />
              {" "}
            </span>
          )
        }
        return (
          <span key={`${w.startMs}-${i}`} className="text-karaoke-ink">
            {w.text}{" "}
          </span>
        )
      })}
    </span>
  )
}

export const LyricLine = forwardRef<HTMLButtonElement, LyricLineProps>(function LyricLine(
  {
    text,
    words,
    romajiText,
    englishText,
    sectionLabel,
    kind = "lyric",
    startMs,
    showTimestamp = false,
    active,
    distanceFromCenter,
    viewportDistancePx,
    lineHeightPx,
    progress,
    wordIndex = -1,
    synced,
    displayMode,
    tvMode = false,
    onSeek,
  },
  ref,
) {
  const reducedMotion = useReducedMotion()
  const isSectionOnly = kind === "section"
  const showNative =
    displayMode === "native" ||
    displayMode === "native-romaji" ||
    displayMode === "both" ||
    displayMode === "all"
  const showRomaji =
    (displayMode === "romaji" || displayMode === "native-romaji" || displayMode === "all") &&
    romajiText
  const showEnglish =
    (displayMode === "english" || displayMode === "both" || displayMode === "all") &&
    englishText
  const romajiIsPrimary = displayMode === "romaji"
  const englishIsPrimary = displayMode === "english"
  const visual =
    viewportDistancePx != null && lineHeightPx != null
      ? getLyricLineVisualFromViewport(
          viewportDistancePx,
          lineHeightPx,
          Boolean(reducedMotion),
          tvMode,
        )
      : getLyricLineVisual(distanceFromCenter, Boolean(reducedMotion), tvMode)
  const lineSize = tvMode ? TV_LINE_SIZE : LINE_SIZE
  const timestampLabel =
    showTimestamp && startMs != null ? formatLyricTimestamp(startMs) : null
  const seekLabel = timestampLabel ? `Seek to ${timestampLabel}, ${text}` : text

  if (isSectionOnly && sectionLabel) {
    return (
      <div className="px-4 py-2" aria-hidden>
        <span className={SECTION_LABEL_CLASS}>{sectionLabel}</span>
      </div>
    )
  }

  const renderPrimaryText = (lineText: string, lineWords?: LyricWord[]) => {
    if (!active) return lineText
    if (!synced) {
      return <span className="text-karaoke-active-line">{lineText}</span>
    }
    if (lineWords && lineWords.length > 0 && wordIndex >= 0) {
      return <PerWordText words={lineWords} wordIndex={wordIndex} progress={progress} />
    }
    return <WordProgressText text={lineText} progress={progress} activeLine />
  }

  const renderNativeText = () => renderPrimaryText(text, words)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSeek}
      className={cn(
        "mx-auto w-full origin-center py-[0.55rem] font-semibold will-change-[transform,opacity,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
        showTimestamp
          ? "grid max-w-xl grid-cols-[minmax(3.75rem,4.25rem)_1fr] items-baseline gap-x-2 px-2 sm:gap-x-3 sm:px-3"
          : "max-w-xl px-3 text-center",
        active ? "text-karaoke-active-line" : "text-karaoke-ink",
      )}
      aria-label={seekLabel}
      aria-current={active ? "true" : undefined}
      style={{
        transformStyle: "preserve-3d",
        opacity: visual.opacity,
        transform: reducedMotion
          ? undefined
          : `translateZ(${visual.z}px) scale(${visual.scale})`,
        filter: !reducedMotion && visual.blur > 0 ? `blur(${visual.blur}px)` : undefined,
        textShadow: active
          ? "0 0 24px color-mix(in oklch, var(--karaoke-active-line) 40%, transparent)"
          : "none",
      }}
    >
      {timestampLabel ? (
        <time
          dateTime={`PT${Math.max(0, startMs!) / 1000}S`}
          className={cn(
            "self-center font-mono lyrics-timestamp-size tabular-nums leading-none sm:lyrics-timestamp-sm-size",
            active ? "text-karaoke-highlight/80" : "text-muted-foreground",
          )}
        >
          {timestampLabel}
        </time>
      ) : null}
      <span className={cn("min-w-0", showTimestamp ? "text-center" : "contents")}>
        {sectionLabel && (
          <span className={cn(SECTION_LABEL_CLASS, "mb-1")}>{sectionLabel}</span>
        )}
        {showNative && (
          <span className={cn(LINE_TEXT, "font-semibold", lineSize)}>
            {renderNativeText()}
          </span>
        )}
        {showRomaji && (
          <span
            className={cn(
              LINE_TEXT,
              romajiIsPrimary
                ? cn("font-semibold", lineSize)
                : tvMode
                  ? "mt-1 lyrics-secondary-tv-size text-karaoke-ink/80"
                  : "mt-1 lyrics-secondary-size text-karaoke-ink/80",
              !romajiIsPrimary && active && synced && "text-karaoke-highlight/80",
            )}
          >
            {romajiIsPrimary
              ? renderPrimaryText(romajiText)
              : active && synced
                ? <WordProgressText text={romajiText} progress={progress} />
                : romajiText}
          </span>
        )}
        {showEnglish && (
          <span
            className={cn(
              LINE_TEXT,
              englishIsPrimary
                ? cn("font-semibold", lineSize)
                : tvMode
                  ? "mt-1 lyrics-secondary-tv-size text-muted-foreground"
                  : "mt-1 lyrics-secondary-size text-muted-foreground",
              !englishIsPrimary && active && synced && "text-karaoke-highlight/80",
            )}
          >
            {englishIsPrimary
              ? renderPrimaryText(englishText)
              : active && synced
                ? <WordProgressText text={englishText} progress={progress} />
                : englishText}
          </span>
        )}
      </span>
    </button>
  )
})
