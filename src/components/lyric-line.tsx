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
  displayMode: "native" | "english" | "both"
  tvMode?: boolean
  onSeek?: () => void
}

const LINE_SIZE =
  "max-w-full text-[clamp(1.15rem,3.2vw,2.25rem)] leading-snug lg:text-[clamp(1.35rem,3.5vw,2.5rem)] lg:leading-tight"
const TV_LINE_SIZE =
  "max-w-full text-[clamp(1.75rem,4.5vw,3.25rem)] leading-snug lg:text-[clamp(2.5rem,6vw,5rem)] lg:leading-tight"
const LINE_TEXT =
  "block w-full break-words [overflow-wrap:anywhere] text-balance hyphens-auto"
const SECTION_LABEL_CLASS =
  "block py-1 text-center text-[0.7rem] font-medium tracking-wide text-muted-foreground"

function WordProgressText({ text, progress }: { text: string; progress: number }) {
  const reducedMotion = useReducedMotion()
  const smoothProgress = useSpring(progress, {
    stiffness: 160,
    damping: 28,
    mass: 0.45,
    restDelta: 0.001,
  })

  if (reducedMotion) {
    return <KaraokeWordProgress text={text} progress={progress} />
  }

  return <SmoothKaraokeProgress text={text} progress={smoothProgress} />
}

function SmoothKaraokeProgress({
  text,
  progress,
}: {
  text: string
  progress: ReturnType<typeof useSpring>
}) {
  const [value, setValue] = useState(() => progress.get())
  useMotionValueEvent(progress, "change", setValue)

  return <KaraokeWordProgress text={text} progress={value} />
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
              <WordProgressText text={w.text} progress={progress} />
              {" "}
            </span>
          )
        }
        return (
          <span key={`${w.startMs}-${i}`} className="text-karaoke-unsung">
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
  const showNative = displayMode !== "english"
  const showEnglish = displayMode !== "native" && englishText
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

  const renderNativeText = () => {
    if (!active) return text
    if (!synced) {
      return <span className="text-karaoke-active-line">{text}</span>
    }
    if (words && words.length > 0 && wordIndex >= 0) {
      return <PerWordText words={words} wordIndex={wordIndex} progress={progress} />
    }
    return <WordProgressText text={text} progress={progress} />
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSeek}
      className={cn(
        "mx-auto w-full max-w-full origin-center scroll-my-6 rounded-lg py-2.5 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none sm:py-3",
        showTimestamp
          ? "grid grid-cols-[minmax(3.75rem,4.25rem)_1fr] items-baseline gap-x-2 px-2 sm:gap-x-3 sm:px-3"
          : "px-3 text-center sm:px-4",
        active ? "text-karaoke-active-line" : "text-karaoke-muted hover:text-foreground",
      )}
      aria-label={seekLabel}
      aria-current={active ? "true" : undefined}
      style={{
        transformStyle: "preserve-3d",
        contain: "layout paint",
        opacity: visual.opacity,
        transform: reducedMotion
          ? undefined
          : `translateZ(${visual.z}px) scale(${visual.scale})`,
        filter: !reducedMotion && visual.blur > 0 ? `blur(${visual.blur}px)` : undefined,
        textShadow: active
          ? "0 0 28px color-mix(in oklch, var(--karaoke-active-line) 42%, transparent), 0 0 56px color-mix(in oklch, var(--karaoke-active-line) 18%, transparent)"
          : "none",
      }}
    >
      {timestampLabel ? (
        <time
          dateTime={`PT${Math.max(0, startMs!) / 1000}S`}
          className={cn(
            "self-center font-mono text-[0.6875rem] tabular-nums leading-none sm:text-xs",
            active ? "text-karaoke-active-line/80" : "text-muted-foreground",
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
        {showEnglish && (
          <span
            className={cn(
              LINE_TEXT,
              tvMode ? "mt-1 text-[clamp(1rem,2vw,2rem)] text-muted-foreground" : "mt-1 text-sm text-muted-foreground",
              active && synced && "text-karaoke-active-line/80",
            )}
          >
            {active && synced ? (
              <WordProgressText text={englishText} progress={progress} />
            ) : (
              englishText
            )}
          </span>
        )}
      </span>
    </button>
  )
})
