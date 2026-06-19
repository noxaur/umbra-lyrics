import { LottieIcon } from "@/components/icons/lottie-icon"
import type { IconName } from "@/components/icons/icon-names"
import { cn } from "@/lib/utils"

export type LyricsEmptyVariant =
  | "idle"
  | "loading"
  | "preparing"
  | "not_found"
  | "partial"
  | "instrumental"
  | "network_error"
  | "gap"

const ICONS: Record<LyricsEmptyVariant, IconName> = {
  idle: "music-2",
  loading: "loader",
  preparing: "music-2",
  not_found: "file-music",
  partial: "file-music",
  instrumental: "mic-2",
  network_error: "wifi-off",
  gap: "music-2",
}

type LyricsEmptyStateProps = {
  variant: LyricsEmptyVariant
  title: string
  detail?: string
  className?: string
}

export function LyricsEmptyState({
  variant,
  title,
  detail,
  className,
}: LyricsEmptyStateProps) {
  const iconName = ICONS[variant]
  const spin = variant === "loading"

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground",
        className,
      )}
      role="status"
      aria-busy={spin || undefined}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted/35">
        <LottieIcon
          name={iconName}
          spin={spin}
          className="size-8 text-muted-foreground/85"
          aria-hidden
        />
      </div>
      <p className="text-base font-medium text-foreground/90">{title}</p>
      {detail ? <p className="max-w-sm text-sm">{detail}</p> : null}
    </div>
  )
}
