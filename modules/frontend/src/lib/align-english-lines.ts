/** Distribute `source` lines across `targetSlots` vocal positions (proportional mapping). */
export function distributeLines(source: string[], targetSlots: number): string[] {
  if (targetSlots <= 0) return []
  if (source.length === 0) return Array.from({ length: targetSlots }, () => "")
  if (source.length === targetSlots) return [...source]
  if (source.length === 1) return Array.from({ length: targetSlots }, () => source[0] ?? "")

  const result: string[] = []
  for (let i = 0; i < targetSlots; i++) {
    const srcIdx = Math.min(source.length - 1, Math.floor((i * source.length) / targetSlots))
    result.push(source[srcIdx] ?? "")
  }
  return result
}

/**
 * Map English lyric lines onto native line indices, preserving blanks/section rows.
 * When counts differ, vocal lines are distributed proportionally.
 */
export function alignEnglishLines(nativeLines: string[], englishLines: string[]): string[] {
  if (englishLines.length === nativeLines.length) return englishLines

  const vocalIndices = nativeLines
    .map((line, index) => (line.trim() ? index : -1))
    .filter((index) => index >= 0)

  const englishVocal = englishLines.map((line) => line.trim()).filter(Boolean)
  if (vocalIndices.length === 0) return nativeLines.map(() => "")
  if (englishVocal.length === 0) return nativeLines.map(() => "")

  const distributed = distributeLines(englishVocal, vocalIndices.length)
  const aligned = nativeLines.map(() => "")
  vocalIndices.forEach((nativeIndex, vocalSlot) => {
    aligned[nativeIndex] = distributed[vocalSlot] ?? ""
  })
  return aligned
}
