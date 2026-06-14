import { motion, MotionConfig } from "motion/react"
import { cn } from "@/lib/utils"

type LyricLineProps = {
  text: string
  englishText?: string
  active: boolean
  progress: number
  displayMode: "native" | "english" | "both"
  onSeek?: () => void
}

export function LyricLine({
  text,
  englishText,
  active,
  progress,
  displayMode,
  onSeek,
}: LyricLineProps) {
  const showNative = displayMode !== "english"
  const showEnglish = displayMode !== "native" && englishText

  return (
    <MotionConfig reducedMotion="user">
      <motion.button
        type="button"
        layout
        onClick={onSeek}
        className={cn(
          "w-full rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "scale-[1.02] text-karaoke-active"
            : "text-karaoke-muted hover:text-foreground",
        )}
        animate={{ opacity: active ? 1 : 0.55 }}
        transition={{ duration: 0.2 }}
        aria-current={active ? "true" : undefined}
      >
        {showNative && (
          <span
            className="block font-semibold leading-tight"
            style={{ fontSize: active ? "clamp(1.5rem, 4vw, 3rem)" : "clamp(1.1rem, 3vw, 1.75rem)" }}
          >
            {active ? (
              <span className="relative inline">
                <span
                  className="absolute inset-0 text-karaoke-active"
                  style={{ width: `${progress * 100}%`, overflow: "hidden" }}
                  aria-hidden
                >
                  {text}
                </span>
                <span className="text-muted-foreground/40">{text}</span>
              </span>
            ) : (
              text
            )}
          </span>
        )}
        {showEnglish && (
          <span className="mt-1 block text-sm text-muted-foreground">{englishText}</span>
        )}
      </motion.button>
    </MotionConfig>
  )
}
