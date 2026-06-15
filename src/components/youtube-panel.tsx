import { cn } from "@/lib/utils"

type YouTubePanelProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  hidden: boolean
  compact?: boolean
  pipOnMobile?: boolean
}

export function YouTubePanel({
  containerRef,
  hidden,
  compact = false,
  pipOnMobile = false,
}: YouTubePanelProps) {
  return (
    <div
      className={cn(
        "relative w-full shrink-0 overflow-hidden bg-black",
        hidden ? "h-0 opacity-0" : "opacity-100",
        !hidden &&
          compact &&
          cn(
            "mx-auto max-w-3xl rounded-lg border border-border",
            pipOnMobile
              ? "h-[100px] max-md:h-20 max-md:shadow-lg sm:h-[140px] lg:h-[180px]"
              : "h-[100px] sm:h-[140px] lg:h-[180px]",
          ),
        !hidden && !compact && "aspect-video rounded-lg",
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
