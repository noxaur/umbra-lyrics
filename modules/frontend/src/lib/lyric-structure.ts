export type StructureParsedLine = {
  /** Sung lyric text; empty when the source row is structure-only */
  text: string
  /** Section name e.g. "Verse 2", "Chorus" */
  sectionLabel?: string
  /** True when the entire source line was a standalone [Tag] */
  isStructureOnly: boolean
  /** True when section implies instrumental/break pause */
  isInstrumentalSection?: boolean
}

const STRUCTURE_TAG_PATTERN =
  /^(intro|outro|verse|chorus|bridge|pre[- ]?chorus|instrumental|break|hook|refrain|interlude|solo)(\s+\d+)?$/i

const INSTRUMENTAL_SECTION_PATTERN =
  /^(instrumental|break|interlude|solo)(\s+\d+)?$/i

const TITLE_WORDS = new Set(["pre", "chorus"])

function formatSectionLabel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, i, parts) => {
      const lower = word.toLowerCase()
      if (lower === "pre" && parts[i + 1]?.toLowerCase() === "chorus") {
        return "Pre"
      }
      if (TITLE_WORDS.has(lower) && i > 0) return word
      if (lower.includes("-")) {
        return lower
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("-")
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

export function isStructureTagName(name: string): boolean {
  return STRUCTURE_TAG_PATTERN.test(name.trim())
}

export function isInstrumentalSection(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/^pre[- ]chorus$/, "")
  return INSTRUMENTAL_SECTION_PATTERN.test(normalized)
}

/** Detect `[Tag]` lines and inline tags; classify as structure metadata, not sung content. */
export function parseLyricStructureTags(text: string): StructureParsedLine[] {
  const rawLines = text.split(/\r?\n/)
  const result: StructureParsedLine[] = []

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()

    const standalone = trimmed.match(/^\[([^\]]+)\]$/)
    if (standalone) {
      const tagName = standalone[1].trim()
      if (isStructureTagName(tagName)) {
        const sectionLabel = formatSectionLabel(tagName)
        result.push({
          text: "",
          sectionLabel,
          isStructureOnly: true,
          isInstrumentalSection: isInstrumentalSection(tagName),
        })
        continue
      }
    }

    const inline = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/)
    if (inline) {
      const tagName = inline[1].trim()
      const lyricText = inline[2].trim()
      if (isStructureTagName(tagName)) {
        const sectionLabel = formatSectionLabel(tagName)
        result.push({
          text: lyricText,
          sectionLabel,
          isStructureOnly: false,
          isInstrumentalSection: isInstrumentalSection(tagName),
        })
        continue
      }
    }

    result.push({ text: rawLine, isStructureOnly: false })
  }

  return result
}
