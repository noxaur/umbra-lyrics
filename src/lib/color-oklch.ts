export type OklchColor = {
  l: number
  c: number
  h: number
  alpha: number
}

const OKLCH_RE =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i

export function parseOklch(value: string): OklchColor | null {
  const match = OKLCH_RE.exec(value.trim())
  if (!match) return null

  let alpha = 1
  if (match[4]) {
    const raw = match[4]
    alpha = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
  }

  return {
    l: Number.parseFloat(match[1]),
    c: Number.parseFloat(match[2]),
    h: Number.parseFloat(match[3]),
    alpha,
  }
}

export function formatOklch({ l, c, h, alpha }: OklchColor): string {
  const lStr = round(l, 3)
  const cStr = round(c, 3)
  const hStr = round(h, 1)
  if (alpha < 1) {
    const aStr = round(alpha, 2)
    return `oklch(${lStr} ${cStr} ${hStr} / ${aStr})`
  }
  return `oklch(${lStr} ${cStr} ${hStr})`
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(n * factor) / factor
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

function rgbToOklch(r: number, g: number, b: number, alpha = 1): OklchColor {
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l = Math.cbrt(l_)
  const m = Math.cbrt(m_)
  const s = Math.cbrt(s_)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const c = Math.sqrt(a * a + b2 * b2)
  let h = (Math.atan2(b2, a) * 180) / Math.PI
  if (h < 0) h += 360

  return { l: L, c, h, alpha }
}

function oklchToRgb({ l, c, h, alpha }: OklchColor): { r: number; g: number; b: number; alpha: number } {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return {
    r: clamp255(linearToSrgb(lr) * 255),
    g: clamp255(linearToSrgb(lg) * 255),
    b: clamp255(linearToSrgb(lb) * 255),
    alpha,
  }
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function hexToOklch(hex: string): OklchColor {
  const normalized = hex.replace("#", "").trim()
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized

  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return rgbToOklch(r, g, b)
}

export function oklchToHex(color: OklchColor): string {
  const { r, g, b } = oklchToRgb(color)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

export function oklchStringToHex(value: string): string {
  const parsed = parseOklch(value)
  if (!parsed) return "#000000"
  return oklchToHex(parsed)
}
