import { cacheLyricsFromPipeline } from "@/lib/cache-lyrics-from-pipeline"
import { getLyricsCache } from "@/lib/lyrics-cache"
import { orchestrateLyricsSearch, type LyricsOrchestratorResult } from "@/lib/lyrics-orchestrator"
import type { LyricsPipelineResult } from "@/lib/lyrics-pipeline"
import { clearLyricsRejection, isLyricsRejected } from "@/lib/lyrics-rejection"
import { clearPlaylistIndexIssue } from "@/lib/playlist-index-issues"
import type { PlaylistIndexTrack } from "@/lib/playlist-lyrics-indexer"
import { updatePlaylistTrackMetadata } from "@/lib/playlists"
import { normalizeTrackMetadata } from "@/lib/track-label"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"
import { fullTranscribeAsProvider } from "@/lib/transcription-service"
import { fetchYouTubeAuthor } from "@/lib/youtube-oembed"
import type { LyricsAlternate, LyricsResult } from "@/types/lyrics"

export type LyricsImportRowStatus =
  | "pending"
  | "scanning"
  | "ready"
  | "needs_metadata"
  | "no_match"
  | "cached"
  | "pasted"
  | "transcribed"
  | "rejected"
  | "error"

export type PlaylistLyricsImportRow = {
  videoId: string
  title: string
  artist: string
  track: string
  durationSec: number
  selected: boolean
  status: LyricsImportRowStatus
  selectedAlternate?: LyricsAlternate
  alternates: LyricsAlternate[]
  pastedLyrics?: string
  transcribedResult?: LyricsResult
  oembedAuthor?: string
  message?: string
}

export type PrepareRowsOptions = {
  includeCached?: boolean
  /** When set, only include these video IDs (e.g. from index issues). */
  videoIds?: string[]
}

export type ScanRowOptions = {
  signal?: AbortSignal
}

export type CommitResult = {
  imported: number
  skipped: number
  failed: number
  errors: string[]
}

const SCAN_CONCURRENCY = 3

function toIndexTrack(row: PlaylistLyricsImportRow): PlaylistIndexTrack {
  return {
    videoId: row.videoId,
    title: row.title,
    artist: row.artist,
    track: row.track,
    durationSec: row.durationSec || null,
  }
}

async function resolveRowMetadata(
  row: PlaylistLyricsImportRow,
): Promise<{
  artist: string
  track: string
  title: string
  durationSec: number
  oembedAuthor?: string
}> {
  const normalized = normalizeTrackMetadata(toIndexTrack(row))
  let durationSec = row.durationSec || 0
  let oembedAuthor = row.oembedAuthor

  if (!durationSec && !oembedAuthor) {
    try {
      oembedAuthor = (await fetchYouTubeAuthor(row.videoId)) ?? undefined
    } catch {
      // Best-effort only
    }
  }

  const resolved = await resolveTrackMetadata({
    title: normalized.title,
    durationSec: durationSec || undefined,
    oembedAuthor,
    roughArtist: row.artist || normalized.artist,
    roughTrack: row.track || normalized.track,
  })

  if (!durationSec && resolved.durationSec) {
    durationSec = resolved.durationSec
  }

  return {
    artist: row.artist.trim() || resolved.artist || normalized.artist,
    track: row.track.trim() || resolved.track || normalized.track,
    title: normalized.title,
    durationSec: durationSec || resolved.durationSec || 0,
    oembedAuthor,
  }
}

function orchestratorToAlternates(result: LyricsOrchestratorResult): LyricsAlternate[] {
  const alternates = result.alternates ?? []
  if (result.lyrics && result.status === "found") {
    const best: LyricsAlternate = {
      providerId: result.providerId ?? result.lyrics.providerId,
      id: result.matchId ?? result.lyrics.id,
      trackName: result.lyrics.plainLyrics ? undefined : undefined,
      synced: result.synced,
      lineCount: 0,
      rankScore: 1,
      lyricsResult: result.lyrics,
    }
    const hasBest = alternates.some(
      (alt) => alt.providerId === best.providerId && alt.id === best.id,
    )
    return hasBest ? alternates : [best, ...alternates]
  }
  return alternates
}

function statusFromMetadata(artist: string, track: string): LyricsImportRowStatus | null {
  if (!track.trim() && !artist.trim()) return "needs_metadata"
  if (!track.trim()) return "needs_metadata"
  if (!artist.trim()) return "needs_metadata"
  return null
}

export function preparePlaylistLyricsImportRows(
  tracks: PlaylistIndexTrack[],
  options: PrepareRowsOptions = {},
): PlaylistLyricsImportRow[] {
  const { includeCached = false, videoIds } = options
  const idSet = videoIds ? new Set(videoIds) : null

  return tracks
    .filter((track) => !idSet || idSet.has(track.videoId))
    .map((track) => {
      const normalized = normalizeTrackMetadata(track)
      const cached = getLyricsCache(track.videoId)
      const isCached = Boolean(cached)
      const isRejected = isLyricsRejected(track.videoId)

      return {
        videoId: track.videoId,
        title: normalized.title,
        artist: normalized.artist,
        track: normalized.track,
        durationSec: track.durationSec ?? 0,
        selected: !isCached && !isRejected,
        status: isRejected ? "rejected" : isCached ? "cached" : "pending",
        alternates: cached?.alternates ?? [],
        selectedAlternate: isCached
          ? undefined
          : undefined,
        message: isRejected
          ? "Lyrics rejected — paste or re-match to try again"
          : isCached
            ? "Already indexed"
            : undefined,
      } satisfies PlaylistLyricsImportRow
    })
    .filter((row) => {
      if (row.status === "rejected") return true
      return includeCached || row.status !== "cached"
    })
}

export async function scanPlaylistLyricsImportRow(
  row: PlaylistLyricsImportRow,
  options: ScanRowOptions = {},
): Promise<PlaylistLyricsImportRow> {
  if (isLyricsRejected(row.videoId)) {
    return {
      ...row,
      status: "rejected",
      selected: false,
      message: "Lyrics rejected — paste or re-match to try again",
    }
  }

  if (row.status === "cached" || row.status === "pasted" || row.status === "transcribed") {
    return row
  }

  if (options.signal?.aborted) {
    return { ...row, status: "error", message: "Scan cancelled" }
  }

  const meta = await resolveRowMetadata(row)
  const metadataIssue = statusFromMetadata(meta.artist, meta.track)

  if (metadataIssue) {
    return {
      ...row,
      artist: meta.artist,
      track: meta.track,
      durationSec: meta.durationSec,
      oembedAuthor: meta.oembedAuthor,
      status: "needs_metadata",
      alternates: [],
      selectedAlternate: undefined,
      message:
        !meta.track.trim() && !meta.artist.trim()
          ? "Artist or track title could not be parsed."
          : !meta.track.trim()
            ? "Track title is missing."
            : "Artist name is missing.",
    }
  }

  try {
    const result = await orchestrateLyricsSearch({
      track: meta.track,
      artist: meta.artist,
      title: meta.title,
      durationSec: Math.round(meta.durationSec) || 0,
      videoId: row.videoId,
      oembedAuthor: meta.oembedAuthor,
      skipTranscription: true,
    })

    const alternates = orchestratorToAlternates(result)
    const best = alternates[0]

    if (result.status === "instrumental") {
      return {
        ...row,
        artist: meta.artist,
        track: meta.track,
        durationSec: meta.durationSec,
        oembedAuthor: meta.oembedAuthor,
        status: "ready",
        alternates,
        selectedAlternate: best,
        message: "Marked instrumental",
      }
    }

    if (result.status === "found" && best) {
      return {
        ...row,
        artist: meta.artist,
        track: meta.track,
        durationSec: meta.durationSec,
        oembedAuthor: meta.oembedAuthor,
        status: "ready",
        alternates,
        selectedAlternate: best,
        message: undefined,
      }
    }

    return {
      ...row,
      artist: meta.artist,
      track: meta.track,
      durationSec: meta.durationSec,
      oembedAuthor: meta.oembedAuthor,
      status: "no_match",
      alternates,
      selectedAlternate: undefined,
      message: result.message || "No lyrics found",
    }
  } catch {
    return {
      ...row,
      artist: meta.artist,
      track: meta.track,
      durationSec: meta.durationSec,
      oembedAuthor: meta.oembedAuthor,
      status: "error",
      alternates: [],
      selectedAlternate: undefined,
      message: "Search failed — check your connection",
    }
  }
}

export async function scanPlaylistLyricsImportRows(
  rows: PlaylistLyricsImportRow[],
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PlaylistLyricsImportRow[]> {
  const pending = rows.filter(
    (row) => row.status === "pending" || row.status === "scanning",
  )
  const rest = rows.filter(
    (row) => row.status !== "pending" && row.status !== "scanning",
  )
  const results: PlaylistLyricsImportRow[] = [...rest]
  let completed = rest.length
  const total = rows.length

  onProgress?.(completed, total)

  for (let i = 0; i < pending.length; i += SCAN_CONCURRENCY) {
    if (signal?.aborted) break
    const batch = pending.slice(i, i + SCAN_CONCURRENCY)
    const scanned = await Promise.all(
      batch.map((row) =>
        scanPlaylistLyricsImportRow({ ...row, status: "scanning" }, { signal }),
      ),
    )
    results.push(...scanned)
    completed += scanned.length
    onProgress?.(completed, total)
  }

  return results.sort(
    (a, b) =>
      rows.findIndex((r) => r.videoId === a.videoId) -
      rows.findIndex((r) => r.videoId === b.videoId),
  )
}

export function rowCanImport(row: PlaylistLyricsImportRow): boolean {
  if (!row.selected) return false
  if (row.status === "cached" || row.status === "rejected") return false
  if (row.status === "pasted" && row.pastedLyrics?.trim()) return true
  if (row.status === "transcribed" && row.transcribedResult) return true
  if (row.status === "ready" && row.selectedAlternate) return true
  return false
}

export function rowNeedsAttention(row: PlaylistLyricsImportRow): boolean {
  if (!row.selected) return false
  if (row.status === "cached" || row.status === "rejected") return false
  return !rowCanImport(row)
}

function buildPipelineFromRow(row: PlaylistLyricsImportRow): LyricsPipelineResult | null {
  if (row.pastedLyrics?.trim()) {
    const text = row.pastedLyrics.trim()
    const lyrics: LyricsResult = {
      id: "pasted",
      providerId: "lrclib",
      plainLyrics: text.includes("[") ? null : text,
      syncedLyrics: text.includes("[") ? text : null,
    }
    return {
      native: {
        status: "found",
        strategy: "pasted",
        attempts: [],
        providersTried: [],
        message: "Pasted lyrics",
        synced: Boolean(lyrics.syncedLyrics),
        lyrics,
        alternates: [],
      },
      romaji: { lines: [], status: "skipped" },
      english: { lines: [], source: "translated", status: "failed" },
      timings: { nativeMs: 0, romajiMs: 0, englishMs: 0, parallelMs: 0 },
    }
  }

  if (row.transcribedResult) {
    return {
      native: {
        status: "found",
        strategy: "transcription",
        providerId: "transcription",
        attempts: [],
        providersTried: ["transcription"],
        message: "Transcribed lyrics",
        synced: false,
        lyrics: row.transcribedResult,
        alternates: [],
      },
      romaji: { lines: [], status: "skipped" },
      english: { lines: [], source: "translated", status: "failed" },
      timings: { nativeMs: 0, romajiMs: 0, englishMs: 0, parallelMs: 0 },
    }
  }

  if (row.selectedAlternate) {
    const lyrics = row.selectedAlternate.lyricsResult
    return {
      native: {
        status: "found",
        strategy: row.selectedAlternate.providerId,
        providerId: row.selectedAlternate.providerId,
        attempts: [],
        providersTried: [row.selectedAlternate.providerId],
        message: "Found lyrics",
        synced: row.selectedAlternate.synced,
        lyrics,
        alternates: row.alternates,
        matchId: row.selectedAlternate.id,
      },
      romaji: { lines: [], status: "skipped" },
      english: { lines: [], source: "translated", status: "failed" },
      timings: { nativeMs: 0, romajiMs: 0, englishMs: 0, parallelMs: 0 },
    }
  }

  return null
}

export async function transcribePlaylistImportRow(
  row: PlaylistLyricsImportRow,
  options: ScanRowOptions = {},
): Promise<PlaylistLyricsImportRow> {
  const meta = await resolveRowMetadata(row)
  const transcription = await fullTranscribeAsProvider({
    videoId: row.videoId,
    artist: meta.artist,
    track: meta.track,
    durationSec: meta.durationSec || undefined,
    signal: options.signal,
  })

  if (!transcription) {
    return {
      ...row,
      artist: meta.artist,
      track: meta.track,
      durationSec: meta.durationSec,
      status: "no_match",
      message: "Transcription produced no lyrics",
    }
  }

  return {
    ...row,
    artist: meta.artist,
    track: meta.track,
    durationSec: meta.durationSec,
    status: "transcribed",
    transcribedResult: {
      id: transcription.candidate.externalId,
      providerId: "transcription",
      plainLyrics: transcription.candidate.plainLyrics,
      syncedLyrics: transcription.candidate.syncedLyrics,
    },
    selectedAlternate: undefined,
    alternates: [],
    message: "Transcribed",
  }
}

export function commitPlaylistLyricsImportRows(
  playlistId: string,
  rows: PlaylistLyricsImportRow[],
): CommitResult {
  const result: CommitResult = { imported: 0, skipped: 0, failed: 0, errors: [] }

  for (const row of rows) {
    if (!row.selected) {
      result.skipped += 1
      continue
    }

    if (row.status === "cached") {
      result.skipped += 1
      continue
    }

    if (!rowCanImport(row)) {
      result.failed += 1
      result.errors.push(`${row.title}: missing required fields`)
      continue
    }

    updatePlaylistTrackMetadata(playlistId, row.videoId, {
      title: row.title,
      artist: row.artist,
      track: row.track,
    })

    const pipeline = buildPipelineFromRow(row)
    if (!pipeline) {
      result.failed += 1
      result.errors.push(`${row.title}: no lyrics to import`)
      continue
    }

    const cached = cacheLyricsFromPipeline(
      {
        videoId: row.videoId,
        title: row.title,
        artist: row.artist,
        track: row.track,
        durationSec: row.durationSec,
        oembedAuthor: row.oembedAuthor,
      },
      pipeline,
    )

    if (cached) {
      clearPlaylistIndexIssue(row.videoId)
      clearLyricsRejection(row.videoId)
      result.imported += 1
    } else {
      result.failed += 1
      result.errors.push(`${row.title}: could not cache lyrics`)
    }
  }

  return result
}

export function rowsFromIndexIssues(
  tracks: PlaylistIndexTrack[],
  issues: Array<{ videoId: string; artist: string; track: string; message: string; reason: string }>,
): PlaylistLyricsImportRow[] {
  const issueMap = new Map(issues.map((i) => [i.videoId, i]))

  return preparePlaylistLyricsImportRows(tracks, { includeCached: true }).map((row) => {
    const issue = issueMap.get(row.videoId)
    if (!issue) return row

    const status: LyricsImportRowStatus =
      issue.reason === "needs_metadata" ? "needs_metadata" : "no_match"

    return {
      ...row,
      artist: issue.artist || row.artist,
      track: issue.track || row.track,
      selected: true,
      status,
      message: issue.message,
      alternates: [],
      selectedAlternate: undefined,
    }
  }).filter((row) => issueMap.has(row.videoId))
}
