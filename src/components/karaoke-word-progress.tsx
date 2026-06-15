import { cn } from "@/lib/utils"

type KaraokeWordProgressProps = {
  text: string
  /** 0–1 sing-along progress across the line */
  progress: number
  className?: string
}

/**
 * Dual-layer clip reveal for synced lyric highlight (no gradient text).
 */
export function KaraokeWordProgress({ text, progress, className }: KaraokeWordProgressProps) {
  const clamped = Math.max(0, Math.min(1, progress))
  const clipRight = (1 - clamped) * 100

  return (
    <span className={cn("relative block w-full", className)}>
      <span className="block text-karaoke-unsung">{text}</span>
      <span
        className="pointer-events-none absolute inset-0 block text-karaoke-active-line"
        style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }}
        aria-hidden
      >
        {text}
      </span>
    </span>
  )
}
