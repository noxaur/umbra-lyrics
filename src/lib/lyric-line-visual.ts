export type LyricLineVisual = {
  scale: number
  opacity: number
  z: number
  blur: number
  y: number
}

export type LyricTextTier = "short" | "medium" | "long" | "xlong"

const ACTIVE_SCALE = 1.06
const ACTIVE_SCALE_COMPACT = 1.03
const NEAR_SCALE = 0.92
const MIN_SCALE = 0.72
const NEAR_OPACITY = 0.82
const MIN_OPACITY = 0.38
const ACTIVE_Z = 56
const NEAR_Z = 32
const FAR_Z_STEP = -26
const MAX_BLUR = 2
const NEAR_Y = 3
const FAR_Y_STEP = 4

/** Character count tiers — CJK counts per grapheme via spread. */
export function getLyricTextTier(text: string): LyricTextTier {
  const len = [...text.trim()].length
  if (len <= 20) return "short"
  if (len <= 40) return "medium"
  if (len <= 60) return "long"
  return "xlong"
}

const ACTIVE_SIZE_BY_TIER: Record<LyricTextTier, string> = {
  short: "text-[clamp(1.5rem,6.5cqw,3rem)] leading-snug",
  medium: "text-[clamp(1.35rem,5.5cqw,2.5rem)] leading-snug",
  long: "text-[clamp(1.1rem,4.5cqw,1.85rem)] leading-tight",
  xlong: "text-[clamp(0.95rem,3.8cqw,1.45rem)] leading-tight",
}

const INACTIVE_SIZE_BY_TIER: Record<LyricTextTier, string> = {
  short: "text-[clamp(0.95rem,3.8cqw,1.35rem)] leading-snug",
  medium: "text-[clamp(0.9rem,3.4cqw,1.2rem)] leading-snug",
  long: "text-[clamp(0.85rem,3cqw,1.1rem)] leading-snug",
  xlong: "text-[clamp(0.8rem,2.6cqw,1rem)] leading-snug",
}

const TV_ACTIVE_SIZE_BY_TIER: Record<LyricTextTier, string> = {
  short: "text-[clamp(1.75rem,7cqw,3.25rem)] leading-tight",
  medium: "text-[clamp(1.5rem,6cqw,2.75rem)] leading-tight",
  long: "text-[clamp(1.25rem,5cqw,2.25rem)] leading-tight",
  xlong: "text-[clamp(1.1rem,4.2cqw,1.85rem)] leading-tight",
}

const TV_INACTIVE_SIZE_BY_TIER: Record<LyricTextTier, string> = {
  short: "text-[clamp(1.1rem,4cqw,1.75rem)] leading-snug",
  medium: "text-[clamp(1rem,3.5cqw,1.5rem)] leading-snug",
  long: "text-[clamp(0.95rem,3cqw,1.3rem)] leading-snug",
  xlong: "text-[clamp(0.85rem,2.6cqw,1.15rem)] leading-snug",
}

export function getLyricTextSizeClass(
  text: string,
  active: boolean,
  tvMode: boolean,
): string {
  const tier = getLyricTextTier(text)
  if (tvMode) {
    return active ? TV_ACTIVE_SIZE_BY_TIER[tier] : TV_INACTIVE_SIZE_BY_TIER[tier]
  }
  return active ? ACTIVE_SIZE_BY_TIER[tier] : INACTIVE_SIZE_BY_TIER[tier]
}

export function getLyricLineVisual(
  distanceFromActive: number,
  reducedMotion: boolean,
  compact = false,
): LyricLineVisual {
  const distance = Math.abs(distanceFromActive)
  const direction = Math.sign(distanceFromActive)

  if (reducedMotion) {
    return {
      scale: 1,
      opacity: distance === 0 ? 1 : distance === 1 ? NEAR_OPACITY : MIN_OPACITY,
      z: 0,
      blur: 0,
      y: 0,
    }
  }

  if (distance === 0) {
    return {
      scale: compact ? ACTIVE_SCALE_COMPACT : ACTIVE_SCALE,
      opacity: 1,
      z: ACTIVE_Z,
      blur: 0,
      y: 0,
    }
  }

  if (distance === 1) {
    return {
      scale: NEAR_SCALE,
      opacity: NEAR_OPACITY,
      z: NEAR_Z,
      blur: 0,
      y: direction * NEAR_Y,
    }
  }

  const depth = distance - 1
  return {
    scale: Math.max(MIN_SCALE, NEAR_SCALE - depth * 0.04),
    opacity: Math.max(MIN_OPACITY, NEAR_OPACITY - depth * 0.1),
    z: NEAR_Z + FAR_Z_STEP * depth,
    blur: Math.min(MAX_BLUR, depth * 0.5),
    y: direction * (NEAR_Y + FAR_Y_STEP * depth),
  }
}

/** Spring for 3D line focus swaps — responsive with minimal bounce. */
export const lyricLineSpring = {
  type: "spring" as const,
  stiffness: 280,
  damping: 32,
  mass: 0.7,
}

export const lyricLineOpacitySpring = {
  type: "spring" as const,
  stiffness: 240,
  damping: 32,
  mass: 0.5,
}
