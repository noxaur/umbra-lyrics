export type LyricLineVisual = {
  scale: number
  opacity: number
  z: number
  blur: number
}

export type LyricVisualMode = "default" | "tv"

const FULL_OPACITY = 1

/** Opacity fades 2× as fast as scale falls from 1.0 — center 1.0, scale 0.78 → opacity 0.56. */
export function opacityFromScale(scale: number, minOpacity = 0): number {
  return Math.max(minOpacity, 2 * scale - 1)
}

function withStackOpacity(visual: Pick<LyricLineVisual, "scale" | "z" | "blur">): LyricLineVisual {
  return { ...visual, opacity: opacityFromScale(visual.scale) }
}

/** Spotify-ish stack keyed by distance from viewport center (symmetric ±d). */
const DEFAULT_STACK: Array<Pick<LyricLineVisual, "scale" | "z" | "blur">> = [
  { scale: 1, z: 0, blur: 0 },
  { scale: 0.92, z: -12, blur: 0.5 },
  { scale: 0.85, z: -24, blur: 1 },
  { scale: 0.78, z: -36, blur: 2 },
]

const TV_STACK: Array<Pick<LyricLineVisual, "scale" | "z" | "blur">> = [
  { scale: 1, z: 0, blur: 0 },
  { scale: 0.95, z: -10, blur: 0.35 },
  { scale: 0.9, z: -20, blur: 0.65 },
  { scale: 0.85, z: -30, blur: 1 },
]

function stackForMode(mode: LyricVisualMode) {
  return mode === "tv" ? TV_STACK : DEFAULT_STACK
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interpolateStackAtDistance(
  fractionalDistance: number,
  mode: LyricVisualMode,
): LyricLineVisual {
  const stack = stackForMode(mode)
  const d = Math.max(0, fractionalDistance)
  const maxIdx = stack.length - 1
  if (d >= maxIdx) {
    return withStackOpacity(stack[maxIdx])
  }

  const lower = Math.floor(d)
  const upper = Math.min(lower + 1, maxIdx)
  const t = d - lower
  const from = stack[lower]
  const to = stack[upper]
  return withStackOpacity({
    scale: lerp(from.scale, to.scale, t),
    z: lerp(from.z, to.z, t),
    blur: lerp(from.blur, to.blur, t),
  })
}

function visualForDistance(distance: number, mode: LyricVisualMode): LyricLineVisual {
  return interpolateStackAtDistance(Math.abs(distance), mode)
}

/** Continuous depth from pixel distance to stage center (smooth while scrolling). */
export function getLyricLineVisualFromViewport(
  distancePx: number,
  lineHeightPx: number,
  reducedMotion: boolean,
  tvMode = false,
): LyricLineVisual {
  if (reducedMotion) {
    return { scale: 1, opacity: FULL_OPACITY, z: 0, blur: 0 }
  }
  const pitch = Math.max(lineHeightPx, 40)
  return interpolateStackAtDistance(
    distancePx / pitch,
    tvMode ? "tv" : "default",
  )
}

export function getLyricLineVisual(
  distanceFromCenter: number,
  reducedMotion: boolean,
  tvMode = false,
): LyricLineVisual {
  if (reducedMotion) {
    return { scale: 1, opacity: FULL_OPACITY, z: 0, blur: 0 }
  }
  return visualForDistance(distanceFromCenter, tvMode ? "tv" : "default")
}

export const lyricLineSpring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 35,
  mass: 0.8,
}

/** Soft spring for 3D depth — follows scroll without tier snapping. */
export const lyricDepthSpring = {
  type: "spring" as const,
  stiffness: 180,
  damping: 24,
  mass: 0.45,
}
