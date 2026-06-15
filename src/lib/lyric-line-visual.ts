export type LyricLineVisual = {
  scale: number
  opacity: number
  z: number
  blur: number
}

const ACTIVE_SCALE = 1.04
const ACTIVE_SCALE_COMPACT = 1
const NEAR_SCALE = 0.94
const MIN_SCALE = 0.7
const NEAR_OPACITY = 0.85
const MIN_OPACITY = 0.35
const ACTIVE_Z = 36
const NEAR_Z = 28
const FAR_Z_STEP = -24
const MAX_BLUR = 2

export function getLyricLineVisual(
  distanceFromActive: number,
  reducedMotion: boolean,
  compact = false,
): LyricLineVisual {
  const distance = Math.abs(distanceFromActive)

  if (reducedMotion) {
    return {
      scale: 1,
      opacity: distance === 0 ? 1 : distance === 1 ? NEAR_OPACITY : MIN_OPACITY,
      z: 0,
      blur: 0,
    }
  }

  if (distance === 0) {
    return {
      scale: compact ? ACTIVE_SCALE_COMPACT : ACTIVE_SCALE,
      opacity: 1,
      z: ACTIVE_Z,
      blur: 0,
    }
  }

  if (distance === 1) {
    return { scale: NEAR_SCALE, opacity: NEAR_OPACITY, z: NEAR_Z, blur: 0 }
  }

  const depth = distance - 1
  return {
    scale: Math.max(MIN_SCALE, NEAR_SCALE - depth * 0.06),
    opacity: Math.max(MIN_OPACITY, NEAR_OPACITY - depth * 0.12),
    z: NEAR_Z + FAR_Z_STEP * depth,
    blur: Math.min(MAX_BLUR, depth * 0.65),
  }
}

export const lyricLineSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
  mass: 0.85,
}
