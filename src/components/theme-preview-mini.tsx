import { useEffect, useState } from "react"
import { motion, MotionConfig, useReducedMotion } from "motion/react"
import { Pause, SkipBack, SkipForward } from "lucide-react"
import { KaraokeWordProgress } from "@/components/karaoke-word-progress"
import { tokensToCssVars, type ThemeTokens } from "@/lib/themes"
import { cn } from "@/lib/utils"

const PREVIEW_LINES = [
  { native: "夜空に輝く星よ", english: "Stars shining in the night sky" },
  { native: "僕らを照らしてくれる", english: "Lighting our way together", active: true },
  { native: "この歌を届けよう", english: "Let me send you this song" },
  { native: "心のままに歌おう", english: "Sing from the heart" },
]

function PreviewWordProgress({ text, progress }: { text: string; progress: number }) {
  return <KaraokeWordProgress text={text} progress={progress} />
}

function PreviewTransport() {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-border/60 px-2 py-1.5">
      <div className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground">
        <SkipBack className="size-2.5" aria-hidden />
      </div>
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Pause className="size-3" aria-hidden />
      </div>
      <div className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground">
        <SkipForward className="size-2.5" aria-hidden />
      </div>
      <div className="ml-1 h-0.5 flex-1 rounded-full bg-muted">
        <div className="h-full w-[42%] rounded-full bg-primary/70" />
      </div>
    </div>
  )
}

type ThemePreviewMiniProps = {
  tokens: ThemeTokens
  animate?: boolean
  className?: string
}

export function ThemePreviewMini({ tokens, animate = true, className }: ThemePreviewMiniProps) {
  const reducedMotion = useReducedMotion()
  const [progress, setProgress] = useState(0.35)

  useEffect(() => {
    if (!animate || reducedMotion) return
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 0.95 ? 0.15 : p + 0.08))
    }, 600)
    return () => window.clearInterval(id)
  }, [animate, reducedMotion])

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn("overflow-hidden rounded-md border border-border/80", className)}
        style={tokensToCssVars(tokens)}
      >
        <div className="bg-karaoke-stage-bg px-2 py-2.5">
          <div className="space-y-0.5">
            {PREVIEW_LINES.map((line, i) => {
              const isActive = line.active === true
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-left transition-colors",
                    isActive ? "text-karaoke-highlight" : "text-karaoke-muted",
                  )}
                >
                  <span
                    className={cn(
                      "block font-semibold leading-tight",
                      isActive ? "text-xs" : "text-[0.6875rem] opacity-70",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        animate={reducedMotion ? undefined : { opacity: [0.85, 1, 0.85] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <PreviewWordProgress text={line.native} progress={progress} />
                      </motion.span>
                    ) : (
                      line.native
                    )}
                  </span>
                  {isActive && (
                    <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">
                      {line.english}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <PreviewTransport />
      </div>
    </MotionConfig>
  )
}
