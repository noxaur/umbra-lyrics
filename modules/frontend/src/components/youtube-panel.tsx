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
        hidden
          ? "h-[180px] w-[320px] shrink-0 opacity-0"
          : "opacity-100",
        !hidden &&
          resolvedLayout === "strip" &&
          "mx-auto h-[84px] max-w-3xl rounded-lg border border-border sm:h-[120px] md:h-[140px]",
        !hidden &&
          resolvedLayout === "column" &&
          "aspect-video min-h-0 flex-1 rounded-lg",
        !hidden &&
          resolvedLayout === "split" &&
          cn(
            "mx-auto h-[84px] max-w-3xl rounded-lg border border-border sm:h-[120px] md:h-[140px]",
            "lg:mx-0 lg:h-full lg:max-h-full lg:w-auto lg:max-w-full lg:min-h-0 lg:flex-none lg:aspect-video lg:border-0 lg:shadow-none",
          ),
      )}
      aria-hidden={hidden}
    >
      <div
        ref={containerRef}
        className="youtube-embed absolute inset-0"
      />
    </div>
  )
}
