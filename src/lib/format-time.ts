/** m:ss for transport bar and coarse durations */
export function formatDuration(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const m = Math.floor(clamped / 60)
  const s = Math.floor(clamped % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** LRC-style mm:ss.xx for lyric line markers */
export function formatLyricTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const min = Math.floor(clamped / 60_000)
  const sec = Math.floor((clamped % 60_000) / 1000)
  const centi = Math.floor((clamped % 1000) / 10)
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${centi.toString().padStart(2, "0")}`
}
