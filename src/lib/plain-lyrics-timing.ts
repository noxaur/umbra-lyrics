import type { LyricLine } from "@/types/lyrics"

/**
 * Syllable/character-weighted timing for plain (unsynced) lyrics.
 * @see docs/superpowers/plans/2026-06-15-lyrics-karaoke-player.md — unsynced fallback
 */
export type PlainLyricsTimingOptions = {
  introRatio?: number
  outroRatio?: number
  introPaddingRatio?: number
  outroPaddingRatio?: number
  introPaddingSec?: number
  outroPaddingSec?: number
  minLineDurationMs?: number
  maxLineDurationMs?: number
  minLineDurationSec?: number
  maxLineDurationSec?: number
  pauseBonusSec?: number
  pauseBonusWeight?: number
  paragraphGapSec?: number
  paragraphBreakWeight?: number
}

/** Alias for orchestrator/docs naming. */
export type PlainTimingOptions = PlainLyricsTimingOptions

type ResolvedOptions = {
  introRatio: number
  outroRatio: number
  introSec: number | null
  outroSec: number | null
  minLineDurationMs: number
  maxLineDurationMs: number
  pauseBonusSec: number
  paragraphGapSec: number
}

const DEFAULTS: ResolvedOptions = {
  introRatio: 0.05,
  outroRatio: 0.03,
  introSec: null,
  outroSec: null,
  minLineDurationMs: 1500,
  maxLineDurationMs: 12000,
  pauseBonusSec: 0.3,
  paragraphGapSec: 0.8,
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
const LATIN_VOWEL_GROUPS = /[aeiouy\u00E0-\u00FC]+/gi
const END_PUNCT_RE = /[.!?…,;:)\]"'。、！？]$/

function resolvedOptions(options: PlainLyricsTimingOptions): ResolvedOptions {
  return {
    introRatio: options.introPaddingRatio ?? options.introRatio ?? DEFAULTS.introRatio,
    outroRatio: options.outroPaddingRatio ?? options.outroRatio ?? DEFAULTS.outroRatio,
    introSec: options.introPaddingSec ?? null,
    outroSec: options.outroPaddingSec ?? null,
    minLineDurationMs:
      options.minLineDurationMs ??
      (options.minLineDurationSec != null
        ? options.minLineDurationSec * 1000
        : DEFAULTS.minLineDurationMs),
    maxLineDurationMs:
      options.maxLineDurationMs ??
      (options.maxLineDurationSec != null
        ? options.maxLineDurationSec * 1000
        : DEFAULTS.maxLineDurationMs),
    pauseBonusSec: options.pauseBonusSec ?? DEFAULTS.pauseBonusSec,
    paragraphGapSec:
      options.paragraphGapSec ??
      (options.paragraphBreakWeight != null
        ? options.paragraphBreakWeight * 0.25
        : DEFAULTS.paragraphGapSec),
  }
}

/** Weight one lyric line for proportional timing (higher = longer slot). */
export function estimateLineWeight(text: string, pauseBonusSec = DEFAULTS.pauseBonusSec): number {
  const trimmed = text.trim()
  if (!trimmed) return 0

  const cjkMatches = trimmed.match(CJK_RE)
  const cjkCount = cjkMatches?.length ?? 0
  const latinPart = trimmed.replace(CJK_RE, " ")
  const vowelGroups = latinPart.match(LATIN_VOWEL_GROUPS)
  const latinSyllables = vowelGroups?.length ?? 0
  const wordFallback = latinPart.split(/\s+/).filter(Boolean).length * 0.8

  let weight = cjkCount + Math.max(latinSyllables, wordFallback * 0.5)
  if (weight < 1) weight = 1

  if (END_PUNCT_RE.test(trimmed)) {
    weight += pauseBonusSec * 3
  }

  return weight
}

export function canAutoTimePlainLyrics(durationSec: number): boolean {
  return durationSec > 0
}

function normalizeForChorus(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim()
}

function countLeadingTrailingGaps(lines: string[]): { leading: number; trailing: number } {
  let leading = 0
  for (const line of lines) {
    if (line.trim()) break
    leading++
  }

  let trailing = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) break
    trailing++
  }

  return { leading, trailing }
}

function applyMinMaxDurations(
  durations: number[],
  minMs: number,
  maxMs: number,
  totalBudgetMs: number,
): number[] {
  const lineCount = durations.length
  if (lineCount === 0) return []

  const effectiveMin =
    lineCount * minMs > totalBudgetMs ? totalBudgetMs / lineCount : minMs

  let result = durations.map((d) => Math.min(maxMs, Math.max(effectiveMin, d)))
  let sum = result.reduce((a, b) => a + b, 0)

  if (sum <= totalBudgetMs) {
    return result
  }

  for (let pass = 0; pass < 8 && sum > totalBudgetMs; pass++) {
    const over = sum - totalBudgetMs
    const shrinkable = result.map((d) => (d > effectiveMin ? d - effectiveMin : 0))
    const shrinkTotal = shrinkable.reduce((a, b) => a + b, 0)
    if (shrinkTotal <= 0) {
      return durations.map((d) => (d / sum) * totalBudgetMs)
    }
    result = result.map((d, i) => {
      if (shrinkable[i] <= 0) return d
      return d - (shrinkable[i] / shrinkTotal) * over
    })
    sum = result.reduce((a, b) => a + b, 0)
  }

  return result
}

/** Chorus lines with identical normalized text get averaged duration. */
function smoothChorusDurations(texts: string[], durations: number[]): number[] {
  const result = [...durations]
  let i = 0
  while (i < texts.length) {
    const key = normalizeForChorus(texts[i])
    if (!key) {
      i++
      continue
    }
    let j = i + 1
    while (j < texts.length && normalizeForChorus(texts[j]) === key) j++
    if (j - i > 1) {
      const avg = result.slice(i, j).reduce((a, b) => a + b, 0) / (j - i)
      for (let k = i; k < j; k++) result[k] = avg
    }
    i = j
  }
  return result
}

export function estimatePlainLyricsTiming(
  lines: string[],
  durationSec: number,
  options: PlainLyricsTimingOptions = {},
): LyricLine[] {
  const opts = resolvedOptions(options)
  const durationMs = Math.max(0, durationSec * 1000)
  if (lines.length === 0) return []

  const vocalLines = lines
    .map((text, index) => ({ text: text.trim(), index }))
    .filter((line) => line.text.length > 0)

  if (vocalLines.length === 0) return []

  if (durationMs <= 0) {
    let cursor = 0
    return vocalLines.map(({ text }) => {
      const startMs = cursor
      cursor += opts.minLineDurationMs
      return { startMs, endMs: cursor, text }
    })
  }

  const { leading, trailing } = countLeadingTrailingGaps(lines)
  let introMs =
    opts.introSec != null ? opts.introSec * 1000 : durationMs * opts.introRatio
  let outroMs =
    opts.outroSec != null ? opts.outroSec * 1000 : durationMs * opts.outroRatio

  if (opts.introSec == null && leading > 0) {
    introMs = Math.min(durationMs * 0.18, introMs + leading * durationMs * 0.025)
  }
  if (opts.outroSec == null && trailing > 0) {
    outroMs = Math.min(durationMs * 0.15, outroMs + trailing * durationMs * 0.02)
  }

  const vocalBudgetMs = Math.max(
    durationMs - introMs - outroMs,
    vocalLines.length * Math.min(opts.minLineDurationMs, (durationMs - introMs - outroMs) / vocalLines.length),
  )

  const weights = lines.map((text) => {
    const trimmed = text.trim()
    if (!trimmed) return opts.paragraphGapSec * 3
    return estimateLineWeight(trimmed, opts.pauseBonusSec)
  })

  const vocalWeights = vocalLines.map(({ index }) => weights[index])
  const totalWeight = vocalWeights.reduce((a, b) => a + b, 0) || vocalLines.length
  const vocalTexts = vocalLines.map(({ text }) => text)

  let durations = vocalWeights.map((w) => (w / totalWeight) * vocalBudgetMs)
  durations = smoothChorusDurations(vocalTexts, durations)
  durations = applyMinMaxDurations(
    durations,
    opts.minLineDurationMs,
    opts.maxLineDurationMs,
    vocalBudgetMs,
  )

  const result: LyricLine[] = []
  let cursor = introMs
  const trackEndMs = durationMs - outroMs

  for (let i = 0; i < vocalLines.length; i++) {
    const remaining = Math.max(0, trackEndMs - cursor)
    const effectiveMin = Math.min(opts.minLineDurationMs, remaining)
    const duration = Math.max(effectiveMin, Math.min(durations[i], remaining))
    const startMs = Math.round(cursor)
    const endMs = Math.round(cursor + duration)
    result.push({ startMs, endMs, text: vocalLines[i].text })
    cursor = endMs
  }

  if (result.length > 0) {
    const last = result[result.length - 1]
    last.endMs = Math.round(Math.min(trackEndMs, Math.max(last.endMs, last.startMs + 500)))
  }

  return result
}
