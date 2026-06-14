import { usePlayerStore } from "@/stores/player-store"
import type { LyricsSearchStep } from "@/lib/lyrics-orchestrator"

const STEPS: { key: LyricsSearchStep; label: string }[] = [
  { key: "parse", label: "Parse" },
  { key: "search", label: "Search" },
  { key: "match", label: "Match" },
  { key: "ready", label: "Ready" },
]

function stepIndex(step: LyricsSearchStep | null): number {
  if (!step) return -1
  return STEPS.findIndex((s) => s.key === step)
}

export function LyricsSearchProgress() {
  const phase = usePlayerStore((s) => s.lyricsSearchPhase)
  const currentStep = usePlayerStore((s) => s.lyricsSearchStep)
  const networkRetryCount = usePlayerStore((s) => s.networkRetryCount)
  const activeIdx = stepIndex(currentStep)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted-foreground" role="status" aria-live="polite">
        {phase ?? "Searching lyrics…"}
        {networkRetryCount > 0 ? ` (retry ${networkRetryCount})` : ""}
      </p>
      <ol
        className="mx-auto hidden w-full max-w-xs items-center justify-between gap-1 text-xs sm:flex"
        aria-label="Lyrics search progress"
      >
        {STEPS.map((step, i) => {
          const done = activeIdx > i
          const active = activeIdx === i
          return (
            <li key={step.key} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={
                  done
                    ? "text-primary"
                    : active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground/60"
                }
              >
                {step.label}
              </span>
              <span
                className={`h-1 w-full rounded-full ${
                  done ? "bg-primary" : active ? "bg-primary/60" : "bg-muted"
                }`}
                aria-hidden
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
