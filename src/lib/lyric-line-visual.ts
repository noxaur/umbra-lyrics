export type LyricLineVisual = {
  scale: number
  opacity: number
  z: number
  blur: number
}

const ACTIVE_SCALE = 1.08
const NEAR_SCALE = 0.92
const MIN_SCALE = 0.7
const NEAR_OPACITY = 0.85
const MIN_OPACITY = 0.35
const ACTIVE_Z = 72
const NEAR_Z = 28
const FAR_Z_STEP = -24
const MAX_BLUR = 2
const MIN_REFERENCE_LINE_HEIGHT = 48

/** Pixel offset from viewport vertical center → line-distance units. */
export function normalizeViewportDistance(
  pixelsFromCenter: number,
  referenceLineHeight: number,
): number {
  return Math.abs(pixelsFromCenter) / Math.max(referenceLineHeight, MIN_REFERENCE_LINE_HEIGHT)
}

/** Blend index distance with viewport distance; closer to either axis wins emphasis. */
export function getEffectiveLineDistance(
  distanceFromActive: number,
  viewportDistance?: number,
): number {
  const indexDistance = Math.abs(distanceFromActive)
  if (viewportDistance === undefined) return indexDistance
  return Math.min(indexDistance, Math.abs(viewportDistance))
}

function visualFromDistance(distance: number, reducedMotion: boolean): LyricLineVisual {
  if (reducedMotion) {
    return {
      scale: 1,
      opacity: distance === 0 ? 1 : distance <= 1 ? NEAR_OPACITY : MIN_OPACITY,
      z: 0,
      blur: 0,
    }
  }

  if (distance === 0) {
    return { scale: ACTIVE_SCALE, opacity: 1, z: ACTIVE_Z, blur: 0 }
  }

  if (distance <= 1) {
    const t = distance
    return {
      scale: ACTIVE_SCALE + (NEAR_SCALE - ACTIVE_SCALE) * t,
      opacity: 1 + (NEAR_OPACITY - 1) * t,
      z: ACTIVE_Z + (NEAR_Z - ACTIVE_Z) * t,
      blur: 0,
    }
  }

  const depth = distance - 1
  return {
    scale: Math.max(MIN_SCALE, NEAR_SCALE - depth * 0.06),
    opacity: Math.max(MIN_OPACITY, NEAR_OPACITY - depth * 0.12),
    z: NEAR_Z + FAR_Z_STEP * depth,
    blur: Math.min(MAX_BLUR, depth * 0.65),
  }
}

export function getLyricLineVisual(
  distanceFromActive: number,
  reducedMotion: boolean,
  viewportDistance?: number,
): LyricLineVisual {
  const distance = getEffectiveLineDistance(distanceFromActive, viewportDistance)
  return visualFromDistance(distance, reducedMotion)
}

export const lyricLineSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 34,
  mass: 0.85,
}
