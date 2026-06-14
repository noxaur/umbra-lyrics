import { cn } from "@/lib/utils"

type YouTubePanelProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  hidden: boolean
}

export function YouTubePanel({ containerRef, hidden }: YouTubePanelProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-black transition-all",
        hidden ? "h-0 opacity-0" : "aspect-video opacity-100",
      )}
      aria-hidden={hidden}
    >
      <div ref={containerRef} className={cn("h-full w-full", hidden && "pointer-events-none")} />
    </div>
  )
}
