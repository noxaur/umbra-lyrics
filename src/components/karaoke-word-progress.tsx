import { cn } from "@/lib/utils"

type KaraokeWordProgressProps = {
  text: string
  /** 0–1 sing-along progress across the line */
  progress: number
  className?: string
  /** Active line uses ink → active-line (handoff v3); default uses unsung → highlight */
  tone?: "default" | "active-line"
}

/**
 * Dual-layer clip reveal for synced lyric highlight (no gradient text).
 */
export function KaraokeWordProgress({
  text,
  progress,
  className,
  tone = "default",
}: KaraokeWordProgressProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  const clipRight = (1 - clamped) * 100
  const baseClass = tone === "active-line" ? "text-karaoke-ink" : "text-karaoke-unsung"
  const sungClass = tone === "active-line" ? "text-karaoke-active-line" : "text-karaoke-highlight"

  return (
    <span className={cn("relative block w-full", className)}>
      <span className={cn("block", baseClass)}>{text}</span>
      <span
        className={cn("pointer-events-none absolute inset-0 block", sungClass)}
        style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }}
        aria-hidden
      >
        {text}
      </span>
    </span>
  )
}
