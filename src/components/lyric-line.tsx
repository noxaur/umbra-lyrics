import { forwardRef, useSyncExternalStore } from "react"
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react"
import { getLyricLineVisual, lyricLineSpring } from "@/lib/lyric-line-visual"
import { cn } from "@/lib/utils"
import type { LyricWord } from "@/types/lyrics"

type LyricLineProps = {
  text: string
  words?: LyricWord[]
  englishText?: string
  sectionLabel?: string
  kind?: "lyric" | "section"
  active: boolean
  distanceFromActive: number
  progress: number
  wordIndex?: number
  synced: boolean
  displayMode: "native" | "english" | "both"
  tvMode?: boolean
  onSeek?: () => void
}

const ACTIVE_SIZE =
  "max-w-full text-[clamp(1.35rem,3.5vw,2.5rem)] leading-snug lg:text-[clamp(3.5rem,4.5vw,7rem)] lg:leading-tight"
const TV_ACTIVE_SIZE = "max-w-full text-[clamp(2.5rem,6vw,5rem)] leading-tight lg:text-[clamp(5rem,8vw,8rem)] lg:leading-none"
const INACTIVE_SIZE = "max-w-full text-[clamp(1rem,2.8vw,1.65rem)] leading-snug"
const TV_INACTIVE_SIZE = "max-w-full text-[clamp(1.1rem,3vw,2rem)] leading-snug"
const LINE_TEXT =
  "block w-full break-words [overflow-wrap:anywhere] text-balance hyphens-auto"
const SECTION_LABEL_CLASS =
  "block py-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70"

function subscribeCompactStage(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {}
  const mq = window.matchMedia("(max-width: 767px)")
  mq.addEventListener("change", onStoreChange)
  return () => mq.removeEventListener("change", onStoreChange)
}

function getCompactStageSnapshot() {
  if (typeof window.matchMedia !== "function") return false
  return window.matchMedia("(max-width: 767px)").matches
}

function WordProgressText({ text, progress }: { text: string; progress: number }) {
  const reducedMotion = useReducedMotion()
  const smoothProgress = useSpring(progress, {
    stiffness: 160,
    damping: 28,
    mass: 0.45,
    restDelta: 0.001,
  })
  const backgroundImage = useTransform(
    smoothProgress,
    (value) =>
      `linear-gradient(to right, var(--karaoke-active-line) ${value * 100}%, var(--karaoke-unsung) ${value * 100}%)`,
  )

  if (reducedMotion) {
    const pct = `${progress * 100}%`
    return (
      <span
        className="bg-clip-text [-webkit-background-clip:text] text-transparent"
        style={{
          backgroundImage: `linear-gradient(to right, var(--karaoke-active-line) ${pct}, var(--karaoke-unsung) ${pct})`,
        }}
      >
        {text}
      </span>
    )
  }

  return (
    <motion.span
      className="bg-clip-text [-webkit-background-clip:text] text-transparent"
      style={{ backgroundImage }}
    >
      {text}
    </motion.span>
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
    active,
    distanceFromActive,
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
  const compactStage = useSyncExternalStore(
    subscribeCompactStage,
    getCompactStageSnapshot,
    () => false,
  )
  const isSectionOnly = kind === "section"
  const showNative = displayMode !== "english"
  const showEnglish = displayMode !== "native" && englishText
  const visual = getLyricLineVisual(distanceFromActive, Boolean(reducedMotion), compactStage)
  const staggerDelay = reducedMotion ? 0 : Math.min(Math.abs(distanceFromActive) * 0.018, 0.12)
  const activeSize = tvMode ? TV_ACTIVE_SIZE : ACTIVE_SIZE
  const inactiveSize = tvMode ? TV_INACTIVE_SIZE : INACTIVE_SIZE

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
    <motion.button
      ref={ref}
      type="button"
      onClick={onSeek}
      className={cn(
        "mx-auto w-full max-w-full origin-center scroll-my-6 rounded-lg px-3 py-2.5 text-center will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none sm:px-4 sm:py-3",
        active ? "text-karaoke-active-line" : "text-karaoke-muted hover:text-foreground",
        tvMode && !active && "opacity-80",
      )}
      aria-current={active ? "true" : undefined}
      animate={{
        scale: visual.scale,
        opacity: tvMode ? Math.max(visual.opacity, active ? 1 : 0.75) : visual.opacity,
        translateZ: visual.z,
        filter: visual.blur > 0 ? `blur(${visual.blur}px)` : "blur(0px)",
      }}
      transition={{
        ...lyricLineSpring,
        delay: staggerDelay,
        filter: reducedMotion ? { duration: 0 } : lyricLineSpring,
      }}
      style={{
        transformStyle: "preserve-3d",
        contain: "layout paint",
        textShadow: active
          ? "0 0 28px color-mix(in oklch, var(--karaoke-active-line) 42%, transparent), 0 0 56px color-mix(in oklch, var(--karaoke-active-line) 18%, transparent)"
          : "none",
      }}
    >
      {sectionLabel && (
        <span className={cn(SECTION_LABEL_CLASS, "mb-1 text-left normal-case tracking-[0.12em]")}>
          {sectionLabel}
        </span>
      )}
      {showNative && (
        <span
          className={cn(
            LINE_TEXT,
            "font-semibold",
            active ? activeSize : inactiveSize,
          )}
        >
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
          {active && synced ? <WordProgressText text={englishText} progress={progress} /> : englishText}
        </span>
      )}
    </motion.button>
  )
})
