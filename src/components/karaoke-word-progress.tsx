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
 * Instant synced lyric highlight (no sliding clip reveal).
 */
export function KaraokeWordProgress({
  text,
  progress,
  className,
  tone = "default",
}: KaraokeWordProgressProps) {
  const baseClass = tone === "active-line" ? "text-karaoke-ink" : "text-karaoke-unsung"
  const sungClass = tone === "active-line" ? "text-karaoke-active-line" : "text-karaoke-highlight"

  return (
    <span className={cn("block w-full", progress > 0 ? sungClass : baseClass, className)}>
      {text}
    </span>
  )
}
