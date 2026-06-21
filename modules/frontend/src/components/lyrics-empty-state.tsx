import { FileMusic, Loader2, Mic2, Music2, WifiOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"
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

const ICONS: Record<LyricsEmptyVariant, LucideIcon> = {
  idle: Music2,
  loading: Loader2,
  preparing: Music2,
  not_found: FileMusic,
  partial: FileMusic,
  instrumental: Mic2,
  network_error: WifiOff,
  gap: Music2,
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
  const Icon = ICONS[variant]
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
        <Icon
          className={cn("size-8 text-muted-foreground/85", spin && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
      </div>
      <p className="text-base font-medium text-foreground/90">{title}</p>
      {detail ? <p className="max-w-sm text-sm">{detail}</p> : null}
    </div>
  )
}
