import { cn } from "@/lib/utils"

type YouTubePanelLayout = "strip" | "column" | "split"

type YouTubePanelProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  hidden: boolean
  /** @deprecated use layout="strip" */
  compact?: boolean
  layout?: YouTubePanelLayout
}

export function YouTubePanel({
  containerRef,
  hidden,
  compact = false,
  layout,
}: YouTubePanelProps) {
  const resolvedLayout: YouTubePanelLayout =
    layout ?? (compact ? "strip" : "column")

  return (
    <div
      className={cn(
        "relative w-full shrink-0 overflow-hidden bg-black",
        hidden ? "h-0 opacity-0" : "opacity-100",
        !hidden &&
          resolvedLayout === "strip" &&
          "mx-auto h-[100px] max-w-3xl rounded-lg border border-border sm:h-[140px]",
        !hidden &&
          resolvedLayout === "column" &&
          "aspect-video min-h-0 flex-1 rounded-lg",
        !hidden &&
          resolvedLayout === "split" &&
          cn(
            "mx-auto h-[100px] max-w-3xl rounded-lg border border-border sm:h-[140px]",
            "lg:mx-0 lg:h-auto lg:max-w-none lg:min-h-0 lg:flex-1 lg:aspect-video lg:border-0 lg:shadow-none",
          ),
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
