import { motion, MotionConfig } from "motion/react"
import { cn } from "@/lib/utils"

type LyricLineProps = {
  text: string
  englishText?: string
  active: boolean
  progress: number
  synced: boolean
  displayMode: "native" | "english" | "both"
  onSeek?: () => void
}

const ACTIVE_SIZE = "text-[clamp(1.5rem,4vw,3rem)] lg:text-[clamp(5rem,5vw,7rem)]"
const INACTIVE_SIZE = "text-[clamp(1.1rem,3vw,1.75rem)]"

function WordProgressText({ text, progress }: { text: string; progress: number }) {
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

export function LyricLine({
  text,
  englishText,
  active,
  progress,
  synced,
  displayMode,
  onSeek,
}: LyricLineProps) {
  const showNative = displayMode !== "english"
  const showEnglish = displayMode !== "native" && englishText

  return (
    <MotionConfig reducedMotion="user">
      <motion.button
        type="button"
        onClick={onSeek}
        className={cn(
          "w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:scale-100",
          active
            ? "scale-[1.02] text-karaoke-active"
            : "text-karaoke-muted hover:text-foreground",
        )}
        aria-current={active ? "true" : undefined}
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
    </MotionConfig>
  )
}
