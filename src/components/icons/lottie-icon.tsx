import Lottie from "lottie-react"
import { useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import type { IconName } from "./icon-names"
import { getIconAnimation } from "./icon-registry"

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
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function LottieIcon({
  name,
  className,
  spin = false,
  hover = false,
  active = false,
  "aria-hidden": ariaHidden = true,
}: LottieIconProps) {
  const lottieRef = useRef<import("lottie-react").LottieRefCurrentProps | null>(null)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const animationData = getIconAnimation(name)

  const shouldSpin = spin && !reducedMotion
  const shouldHover = hover && !reducedMotion && !active

  const handleMouseEnter = useCallback(() => {
    if (!shouldHover) return
    lottieRef.current?.play()
  }, [shouldHover])

  const handleMouseLeave = useCallback(() => {
    if (!shouldHover) return
    lottieRef.current?.goToAndStop(0, true)
  }, [shouldHover])

  return (
    <div
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      aria-hidden={ariaHidden}
      onMouseEnter={shouldHover ? handleMouseEnter : undefined}
      onMouseLeave={shouldHover ? handleMouseLeave : undefined}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={shouldSpin}
        autoplay={shouldSpin}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
