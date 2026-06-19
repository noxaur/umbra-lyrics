import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

type MonsterPhase = "pop" | "drunk" | "dropped" | "falling"

const DRUNK_DURATION_MS = 2200
const DROP_DURATION_MS = 350
const FALL_DURATION_MS = 1100

function MonsterSvg({ dizzy }: { dizzy: boolean }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className="h-32 w-28 drop-shadow-lg sm:h-40 sm:w-36"
      aria-hidden
    >
      <ellipse cx="60" cy="118" rx="34" ry="8" fill="oklch(0 0 0 / 0.18)" />
      <path
        d="M24 78c4-38 32-58 60-58s56 20 60 58c2 24-10 44-32 48H56c-22-4-34-24-32-48z"
        fill="oklch(0.58 0.22 150)"
      />
      <path
        d="M30 44c8-10 18-14 30-14s22 4 30 14"
        fill="none"
        stroke="oklch(0.45 0.18 150)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="42" cy="72" r="14" fill="oklch(0.98 0.01 280)" />
      <circle cx="78" cy="72" r="14" fill="oklch(0.98 0.01 280)" />
      {dizzy ? (
        <>
          <path
            d="M36 72c4-6 8-6 12 0M70 72c4-6 8-6 12 0"
            fill="none"
            stroke="oklch(0.2 0.02 280)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <text x="42" y="76" fontSize="10" textAnchor="middle" fill="oklch(0.2 0.02 280)">
            x
          </text>
          <text x="78" y="76" fontSize="10" textAnchor="middle" fill="oklch(0.2 0.02 280)">
            x
          </text>
        </>
      ) : (
        <>
          <circle cx="46" cy="74" r="5" fill="oklch(0.2 0.02 280)" />
          <circle cx="82" cy="74" r="5" fill="oklch(0.2 0.02 280)" />
          <circle cx="48" cy="72" r="1.8" fill="oklch(0.98 0.01 280)" />
          <circle cx="84" cy="72" r="1.8" fill="oklch(0.98 0.01 280)" />
        </>
      )}
      <path
        d="M48 96c6 8 18 8 24 0"
        fill="none"
        stroke="oklch(0.35 0.12 150)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="88" y="88" width="10" height="22" rx="2" fill="oklch(0.72 0.12 85)" />
      <rect x="86" y="84" width="14" height="6" rx="2" fill="oklch(0.62 0.1 85)" />
    </svg>
  )
}

function phaseMotion(phase: MonsterPhase, reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0, y: 40 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 80 },
      transition: { duration: 0.2 },
    }
  }

  switch (phase) {
    case "pop":
      return {
        initial: { scale: 0.2, y: "60vh", rotate: -8 },
        animate: { scale: 1, y: 0, rotate: 0 },
        transition: { type: "spring" as const, stiffness: 420, damping: 16 },
      }
    case "drunk":
      return {
        animate: {
          rotate: [-6, 8, -10, 12, -8, 6, -12, 10, -6],
          x: [-10, 14, -16, 12, -14, 10, -8, 6, 0],
          y: [0, -4, 2, -6, 3, -5, 2, -3, 0],
        },
        transition: { duration: DRUNK_DURATION_MS / 1000, ease: "easeInOut" as const },
      }
    case "dropped":
      return {
        animate: {
          y: [-28, 0],
          rotate: [4, -18],
          scale: [1.04, 1],
        },
        transition: { duration: DROP_DURATION_MS / 1000, ease: "easeOut" as const },
      }
    case "falling":
      return {
        animate: {
          y: ["0vh", "120vh"],
          rotate: [-18, 140],
          opacity: [1, 1, 0.9],
        },
        transition: { duration: FALL_DURATION_MS / 1000, ease: "easeIn" as const },
      }
  }
}

export function MonsterEasterEgg({
  active,
  generation,
  onFinished,
}: {
  active: boolean
  generation: number
  onFinished: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<MonsterPhase>("pop")

  useEffect(() => {
    if (!active) return

    setPhase("pop")
    const drunkTimer = window.setTimeout(() => setPhase("drunk"), reduceMotion ? 120 : 520)
    const dropTimer = window.setTimeout(
      () => setPhase("dropped"),
      reduceMotion ? 260 : 520 + DRUNK_DURATION_MS,
    )
    const fallTimer = window.setTimeout(
      () => setPhase("falling"),
      reduceMotion ? 420 : 520 + DRUNK_DURATION_MS + DROP_DURATION_MS,
    )
    const doneTimer = window.setTimeout(
      () => onFinished(),
      reduceMotion ? 700 : 520 + DRUNK_DURATION_MS + DROP_DURATION_MS + FALL_DURATION_MS + 80,
    )

    return () => {
      window.clearTimeout(drunkTimer)
      window.clearTimeout(dropTimer)
      window.clearTimeout(fallTimer)
      window.clearTimeout(doneTimer)
    }
  }, [active, generation, onFinished, reduceMotion])

  const motionProps = phaseMotion(phase, Boolean(reduceMotion))

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="monster-easter-egg"
          data-testid="monster-easter-egg"
          role="presentation"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative"
            {...motionProps}
          >
            <MonsterSvg dizzy={phase === "drunk" || phase === "dropped" || phase === "falling"} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
