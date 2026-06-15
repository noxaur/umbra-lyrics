import type { LyricLine } from "@/types/lyrics"
import type { StructureParsedLine } from "@/lib/lyric-structure"

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
  sectionGapSec?: number
  instrumentalGapSec?: number
  /** Show standalone structure tags as muted section labels (default true) */
  showSectionLabels?: boolean
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
  sectionGapSec: number
  instrumentalGapSec: number
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
  sectionGapSec: 1.2,
  instrumentalGapSec: 2.5,
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
    sectionGapSec: options.sectionGapSec ?? DEFAULTS.sectionGapSec,
    instrumentalGapSec: options.instrumentalGapSec ?? DEFAULTS.instrumentalGapSec,
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

type TimingSourceLine = string | StructureParsedLine

function normalizeTimingLine(line: TimingSourceLine): StructureParsedLine {
  if (typeof line === "string") {
    return { text: line, isStructureOnly: false }
  }
  return line
}

function structureGapMs(line: StructureParsedLine, opts: ResolvedOptions): number {
  if (!line.isStructureOnly) return 0
  if (line.isInstrumentalSection) return opts.instrumentalGapSec * 1000
  return opts.sectionGapSec * 1000
}

function reservedStructureGapMs(parsedLines: StructureParsedLine[], opts: ResolvedOptions): number {
  return parsedLines.reduce((sum, line) => sum + structureGapMs(line, opts), 0)
}

export function estimatePlainLyricsTiming(
  lines: TimingSourceLine[],
  durationSec: number,
  options: PlainLyricsTimingOptions = {},
): LyricLine[] {
  const opts = resolvedOptions(options)
  const durationMs = Math.max(0, durationSec * 1000)
  if (lines.length === 0) return []

  const parsedLines = lines.map(normalizeTimingLine)

  const vocalLines = parsedLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !line.isStructureOnly && line.text.trim().length > 0)

  if (vocalLines.length === 0) return []

  if (durationMs <= 0) {
    let cursor = 0
    return vocalLines.map(({ line }) => {
      const startMs = cursor
      cursor += opts.minLineDurationMs
      return {
        startMs,
        endMs: cursor,
        text: line.text.trim(),
        sectionLabel: line.sectionLabel,
        kind: "lyric" as const,
      }
    })
  }

  const rawTextLines = parsedLines.map((line) => line.text)
  const { leading, trailing } = countLeadingTrailingGaps(rawTextLines)
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

  const gapReserveMs = Math.min(
    reservedStructureGapMs(parsedLines, opts),
    Math.max(0, durationMs - introMs - outroMs) * 0.35,
  )

  const vocalBudgetMs = Math.max(
    durationMs - introMs - outroMs - gapReserveMs,
    vocalLines.length *
      Math.min(
        opts.minLineDurationMs,
        (durationMs - introMs - outroMs - gapReserveMs) / vocalLines.length,
      ),
  )

  const vocalWeights = vocalLines.map(({ line }) =>
    estimateLineWeight(line.text.trim(), opts.pauseBonusSec),
  )
  const totalWeight = vocalWeights.reduce((a, b) => a + b, 0) || vocalLines.length
  const vocalTexts = vocalLines.map(({ line }) => line.text.trim())

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
  const showSectionLabels = options.showSectionLabels ?? true
  let vocalIdx = 0

  for (const parsed of parsedLines) {
    if (parsed.isStructureOnly) {
      if (showSectionLabels && parsed.sectionLabel) {
        const at = Math.round(cursor)
        result.push({
          startMs: at,
          endMs: at,
          text: "",
          sectionLabel: parsed.sectionLabel,
          kind: "section",
        })
      }
      cursor += structureGapMs(parsed, opts)
      continue
    }

    const trimmed = parsed.text.trim()
    if (!trimmed) continue

    const remaining = Math.max(0, trackEndMs - cursor)
    const effectiveMin = Math.min(opts.minLineDurationMs, remaining)
    const duration = Math.max(effectiveMin, Math.min(durations[vocalIdx], remaining))
    const startMs = Math.round(cursor)
    const endMs = Math.round(cursor + duration)
    result.push({
      startMs,
      endMs,
      text: trimmed,
      sectionLabel: parsed.sectionLabel,
      kind: "lyric",
    })
    cursor = endMs
    vocalIdx++
  }

  const vocalResult = result.filter((line) => line.kind !== "section")
  if (vocalResult.length > 0) {
    const last = vocalResult[vocalResult.length - 1]
    last.endMs = Math.round(Math.min(trackEndMs, Math.max(last.endMs, last.startMs + 500)))
  }

  return result
}
