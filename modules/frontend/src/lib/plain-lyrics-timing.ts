import { parseLyricStructureTags, type StructureParsedLine } from "@/lib/lyric-structure"
import type { LyricLine } from "@/types/lyrics"

/**
 * Syllable/character-weighted timing for plain (unsynced) lyrics.
 * @see docs/plans/spotify-style-lyrics-player.md — unsynced fallback
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
  showSectionLabels?: boolean
}

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
  introRatio: 0.08,
  outroRatio: 0.05,
  introSec: null,
  outroSec: null,
  minLineDurationMs: 1200,
  maxLineDurationMs: 11000,
  pauseBonusSec: 0.3,
  paragraphGapSec: 1.4,
  sectionGapSec: 1.4,
  instrumentalGapSec: 2.8,
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
const LATIN_VOWEL_GROUPS = /[aeiouy\u00E0-\u00FC]+/gi
const END_PUNCT_RE = /[.!?…]$/ 
const MID_PUNCT_RE = /[,;:)\]"'。、！？]$/

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

export function estimateLineWeight(text: string, pauseBonusSec = DEFAULTS.pauseBonusSec): number {
  const trimmed = text.trim()
  if (!trimmed) return 0

  const cjkMatches = trimmed.match(CJK_RE)
  const cjkCount = cjkMatches?.length ?? 0
  const latinPart = trimmed.replace(CJK_RE, " ")
  const vowelGroups = latinPart.match(LATIN_VOWEL_GROUPS)
  const latinSyllables = vowelGroups?.length ?? 0
  const wordFallback = latinPart.split(/\s+/).filter(Boolean).length

  let weight =
    cjkCount > 0 && cjkCount / trimmed.length > 0.3
      ? cjkCount * 1.15
      : Math.max(latinSyllables, wordFallback * 0.85)

  if (weight < 1) weight = 1

  if (END_PUNCT_RE.test(trimmed)) {
    weight *= 1.35
    weight += pauseBonusSec * 2
  } else if (MID_PUNCT_RE.test(trimmed)) {
    weight *= 1.12
    weight += pauseBonusSec
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

type ParsedParagraph = {
  lines: StructureParsedLine[]
  paragraphBreakAfter: boolean
}

export function splitLyricsParagraphs(text: string): ParsedParagraph[] {
  const paragraphs = text.split(/\n\s*\n/)
  return paragraphs.map((paragraph, index) => ({
    lines: parseLyricStructureTags(paragraph),
    paragraphBreakAfter: index < paragraphs.length - 1,
  }))
}

export function flattenParagraphs(paragraphs: ParsedParagraph[]): {
  lines: StructureParsedLine[]
  paragraphBreakAfterVocal: Set<number>
} {
  const lines: StructureParsedLine[] = []
  const paragraphBreakAfterVocal = new Set<number>()
  let vocalIdx = -1

  for (const paragraph of paragraphs) {
    for (const line of paragraph.lines) {
      lines.push(line)
      if (!line.isStructureOnly && line.text.trim()) {
        vocalIdx++
      }
    }
    if (paragraph.paragraphBreakAfter && vocalIdx >= 0) {
      paragraphBreakAfterVocal.add(vocalIdx)
    }
  }

  return { lines, paragraphBreakAfterVocal }
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

  if (sum <= totalBudgetMs) return result

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

function lockChorusDurations(texts: string[], durations: number[]): number[] {
  const result = [...durations]
  const groups = new Map<string, number[]>()

  texts.forEach((text, index) => {
    const key = normalizeForChorus(text)
    if (!key) return
    const list = groups.get(key) ?? []
    list.push(index)
    groups.set(key, list)
  })

  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const reference = durations[indices[0]]
    for (const index of indices) {
      result[index] = reference
    }
  }

  return result
}

function normalizeTailDurations(
  durations: number[],
  paragraphGapsMs: number[],
  targetBudgetMs: number,
): number[] {
  if (durations.length === 0) return durations
  const gapTotal = paragraphGapsMs.reduce((sum, gap) => sum + gap, 0)
  const current = durations.reduce((sum, d) => sum + d, 0) + gapTotal
  if (current <= 0 || Math.abs(current - targetBudgetMs) < 400) return durations

  const scale = targetBudgetMs / current
  const pivot = Math.max(1, Math.floor(durations.length * 0.65))
  const head = durations.slice(0, pivot)
  const tail = durations.slice(pivot).map((d) => d * scale)
  const headSum = head.reduce((sum, d) => sum + d, 0)
  const tailSum = tail.reduce((sum, d) => sum + d, 0)
  const remaining = Math.max(0, targetBudgetMs - gapTotal - headSum)
  if (tailSum <= 0) return durations

  const tailScale = remaining / tailSum
  return [...head, ...tail.map((d) => d * tailScale)]
}

function structureGapMs(line: StructureParsedLine, opts: ResolvedOptions): number {
  if (!line.isStructureOnly) return 0
  if (line.isInstrumentalSection) return opts.instrumentalGapSec * 1000
  return opts.sectionGapSec * 1000
}

type TimingSourceLine = string | StructureParsedLine

function normalizeTimingLine(line: TimingSourceLine): StructureParsedLine {
  if (typeof line === "string") {
    return { text: line, isStructureOnly: false }
  }
  return line
}

export function estimatePlainLyricsTiming(
  lines: TimingSourceLine[],
  durationSec: number,
  options: PlainLyricsTimingOptions = {},
): LyricLine[] {
  const opts = resolvedOptions(options)
  const durationMs = Math.max(0, durationSec * 1000)
  if (lines.length === 0) return []

  let parsedLines: StructureParsedLine[]
  let paragraphBreakAfterVocal = new Set<number>()
  let leadingBlankBonus = 0

  if (typeof lines[0] === "string") {
    const stringLines = lines as string[]
    if (stringLines.length === 1 && stringLines[0].includes("\n")) {
      const flattened = flattenParagraphs(splitLyricsParagraphs(stringLines[0]))
      parsedLines = flattened.lines
      paragraphBreakAfterVocal = flattened.paragraphBreakAfterVocal
    } else {
      parsedLines = stringLines
        .filter((text) => text.trim().length > 0)
        .map((text) => ({ text, isStructureOnly: false }))
      const leadingBlankCount = stringLines.findIndex((text) => text.trim().length > 0)
      if (leadingBlankCount > 0) leadingBlankBonus = leadingBlankCount
    }
  } else {
    parsedLines = lines.map(normalizeTimingLine)
  }

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

  const gapBudgetCap = Math.min(durationMs * 0.15, 45_000)
  const paragraphGapCount = [...paragraphBreakAfterVocal].length
  const paragraphGapMs =
    paragraphGapCount > 0 ? Math.min(opts.paragraphGapSec * 1000, gapBudgetCap / paragraphGapCount) : 0

  let introMs =
    opts.introSec != null ? opts.introSec * 1000 : durationMs * opts.introRatio
  let outroMs =
    opts.outroSec != null ? opts.outroSec * 1000 : durationMs * opts.outroRatio

  if (opts.introSec == null && leadingBlankBonus > 0) {
    introMs = Math.min(durationMs * 0.22, introMs + leadingBlankBonus * durationMs * 0.025)
  }

  introMs = Math.min(introMs, durationMs * 0.22)
  outroMs = Math.min(outroMs, durationMs * 0.18)

  const structureGapMsTotal = Math.min(
    parsedLines.reduce((sum, line) => sum + structureGapMs(line, opts), 0),
    Math.max(0, durationMs - introMs - outroMs) * 0.3,
  )

  const paragraphReserveMs = paragraphGapCount * paragraphGapMs
  const vocalBudgetMs = Math.max(
    durationMs - introMs - outroMs - structureGapMsTotal - paragraphReserveMs,
    vocalLines.length * Math.min(opts.minLineDurationMs, 900),
  )

  const vocalWeights = vocalLines.map(({ line }) =>
    estimateLineWeight(line.text.trim(), opts.pauseBonusSec),
  )
  const totalWeight = vocalWeights.reduce((a, b) => a + b, 0) || vocalLines.length
  const vocalTexts = vocalLines.map(({ line }) => line.text.trim())

  let durations = vocalWeights.map((w) => (w / totalWeight) * vocalBudgetMs)
  durations = lockChorusDurations(vocalTexts, durations)
  durations = applyMinMaxDurations(
    durations,
    opts.minLineDurationMs,
    opts.maxLineDurationMs,
    vocalBudgetMs,
  )

  const paragraphGaps = vocalTexts.map((_, index) =>
    paragraphBreakAfterVocal.has(index) ? paragraphGapMs : 0,
  )
  durations = normalizeTailDurations(durations, paragraphGaps, vocalBudgetMs)
  durations = lockChorusDurations(vocalTexts, durations)

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
    if (paragraphBreakAfterVocal.has(vocalIdx)) {
      cursor += paragraphGapMs
    }
    vocalIdx++
  }

  const vocalResult = result.filter((line) => line.kind !== "section")
  if (vocalResult.length > 0) {
    const last = vocalResult[vocalResult.length - 1]
    last.endMs = Math.round(Math.min(trackEndMs, Math.max(last.endMs, last.startMs + 800)))
  }

  return result
}
