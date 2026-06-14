import { cn } from "@/lib/utils"

type YouTubePanelProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  hidden: boolean
}

export function YouTubePanel({ containerRef, hidden }: YouTubePanelProps) {
  return (
    <div
      className={cn(
        "relative w-full shrink-0 overflow-hidden rounded-lg bg-black",
        hidden ? "h-0 opacity-0" : "aspect-video opacity-100",
      )}
      aria-hidden={hidden}
    >
      <div
        ref={containerRef}
        className={cn(
          "youtube-embed absolute inset-0",
          hidden && "pointer-events-none",
        )}
      />
    </div>
  )
}
