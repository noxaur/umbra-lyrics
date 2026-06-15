import { forwardRef } from "react"
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react"
import { getLyricLineVisual, lyricLineSpring } from "@/lib/lyric-line-visual"
import { cn } from "@/lib/utils"

type LyricLineProps = {
  text: string
  englishText?: string
  active: boolean
  distanceFromActive: number
  progress: number
  synced: boolean
  displayMode: "native" | "english" | "both"
  onSeek?: () => void
}

const ACTIVE_SIZE = "text-[clamp(1.5rem,4vw,3rem)] lg:text-[clamp(5rem,5vw,7rem)]"
const INACTIVE_SIZE = "text-[clamp(1.1rem,3vw,1.75rem)]"

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
      `linear-gradient(to right, var(--karaoke-active) ${value * 100}%, var(--karaoke-unsung) ${value * 100}%)`,
  )

  if (reducedMotion) {
    const pct = `${progress * 100}%`
    return (
      <span
        className="bg-clip-text [-webkit-background-clip:text] text-transparent"
        style={{
          backgroundImage: `linear-gradient(to right, var(--karaoke-active) ${pct}, var(--karaoke-unsung) ${pct})`,
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

export const LyricLine = forwardRef<HTMLButtonElement, LyricLineProps>(function LyricLine(
  {
    text,
    englishText,
    active,
    distanceFromActive,
    progress,
    synced,
    displayMode,
    onSeek,
  },
  ref,
) {
  const reducedMotion = useReducedMotion()
  const showNative = displayMode !== "english"
  const showEnglish = displayMode !== "native" && englishText
  const visual = getLyricLineVisual(distanceFromActive, Boolean(reducedMotion))
  const staggerDelay = reducedMotion ? 0 : Math.min(Math.abs(distanceFromActive) * 0.018, 0.12)

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onSeek}
      className={cn(
        "w-full rounded-lg px-4 py-3 text-left will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none",
        active ? "text-karaoke-active" : "text-karaoke-muted hover:text-foreground",
      )}
      aria-current={active ? "true" : undefined}
      animate={{
        scale: visual.scale,
        opacity: visual.opacity,
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
        textShadow: active
          ? "0 0 28px color-mix(in oklch, var(--karaoke-active) 42%, transparent), 0 0 56px color-mix(in oklch, var(--karaoke-active) 18%, transparent)"
          : "none",
      }}
    >
      {showNative && (
        <span
          className={cn(
            "block font-semibold leading-tight",
            active ? ACTIVE_SIZE : INACTIVE_SIZE,
          )}
        >
          {active && synced ? <WordProgressText text={text} progress={progress} /> : text}
        </span>
      )}
      {showEnglish && (
        <span className="mt-1 block text-sm text-muted-foreground">{englishText}</span>
      )}
    </motion.button>
  )
})
