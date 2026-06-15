import { useId } from "react"
import { formatOklch, hexToOklch, oklchStringToHex, parseOklch } from "@/lib/color-oklch"
import { cn } from "@/lib/utils"

type ThemeColorInputProps = {
  label: string
  value: string
  onChange: (oklch: string) => void
  className?: string
}

export function ThemeColorInput({ label, value, onChange, className }: ThemeColorInputProps) {
  const id = useId()
  const parsed = parseOklch(value)
  const hex = oklchStringToHex(value)

  const handleHexChange = (nextHex: string) => {
    const oklch = hexToOklch(nextHex)
    if (parsed && parsed.alpha < 1) {
      oklch.alpha = parsed.alpha
    }
    onChange(formatOklch(oklch))
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium leading-none">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={hex}
          onChange={(e) => handleHexChange(e.target.value)}
          className="size-11 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-describedby={`${id}-oklch`}
        />
        <code
          id={`${id}-oklch`}
          className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-2 text-xs text-muted-foreground"
        >
          {parsed ? formatOklch(parsed) : value}
        </code>
      </div>
    </div>
  )
}

export const BUILDER_TOKEN_FIELDS = [
  { key: "karaokeStageBg", label: "Stage background" },
  { key: "karaokeActive", label: "Active lyric" },
  { key: "karaokeMuted", label: "Inactive lyric" },
  { key: "karaokeUnsung", label: "Unsung lyric" },
  { key: "primary", label: "Accent / primary" },
  { key: "foreground", label: "Foreground" },
  { key: "mutedForeground", label: "Muted text" },
  { key: "border", label: "Border" },
] as const

export type BuilderTokenKey = (typeof BUILDER_TOKEN_FIELDS)[number]["key"]
