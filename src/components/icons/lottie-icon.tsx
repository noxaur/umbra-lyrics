import Lottie from "lottie-react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import type { IconName } from "./icon-names"
import { getIconAnimation } from "./icon-registry"

const TOGGLE_FRAME_ICONS = new Set<IconName>(["play", "pause"])
/** Shared toggle animations that always rest on the final frame (close, etc.). */
const REST_ON_END_FRAME = new Set<IconName>(["x"])

type LottieIconProps = {
  name: IconName
  className?: string
  /** Looping spinner (Loader2, RefreshCw while active) */
  spin?: boolean
  /** Play animation on hover (replaces AnimatedIcon Motion behavior) */
  hover?: boolean
  /** For play/pause: skip hover wiggle when active */
  active?: boolean
  "aria-hidden"?: boolean
  "aria-label"?: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function seekStaticFrame(
  lottieRef: import("lottie-react").LottieRefCurrentProps | null,
  name: IconName,
  {
    spin,
    hover,
    active,
    animationData,
  }: { spin: boolean; hover: boolean; active: boolean; animationData: object },
) {
  if (!lottieRef || spin) return

  const totalFrames =
    lottieRef.getDuration(true) ?? (animationData as { op?: number }).op ?? 1
  if (!totalFrames || totalFrames < 1) return

  if (REST_ON_END_FRAME.has(name)) {
    lottieRef.goToAndStop(totalFrames - 1, true)
    return
  }

  if (TOGGLE_FRAME_ICONS.has(name)) {
    lottieRef.goToAndStop(active ? totalFrames - 1 : 0, true)
    return
  }

  if (!hover) {
    lottieRef.goToAndStop(0, true)
  }
}

export function LottieIcon({
  name,
  className,
  spin = false,
  hover = false,
  active = false,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
}: LottieIconProps) {
  const lottieRef = useRef<import("lottie-react").LottieRefCurrentProps | null>(null)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const animationData = getIconAnimation(name)

  const shouldSpin = spin && !reducedMotion
  const shouldHover = hover && !reducedMotion && !active
  const isDecorative = ariaLabel ? false : (ariaHidden ?? true)

  const syncStaticFrame = useCallback(() => {
    seekStaticFrame(lottieRef.current, name, {
      spin: shouldSpin,
      hover: shouldHover,
      active,
      animationData,
    })
  }, [active, animationData, name, shouldHover, shouldSpin])

  useEffect(() => {
    syncStaticFrame()
  }, [syncStaticFrame])

  const handleMouseEnter = useCallback(() => {
    if (!shouldHover) return
    lottieRef.current?.play()
  }, [shouldHover])

  const handleMouseLeave = useCallback(() => {
    if (!shouldHover) return
    syncStaticFrame()
  }, [shouldHover, syncStaticFrame])

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        "[&_svg_path]:stroke-current [&_svg_path]:fill-current",
        className,
      )}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
      onMouseEnter={shouldHover ? handleMouseEnter : undefined}
      onMouseLeave={shouldHover ? handleMouseLeave : undefined}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={shouldSpin}
        autoplay={shouldSpin}
        onDOMLoaded={syncStaticFrame}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
