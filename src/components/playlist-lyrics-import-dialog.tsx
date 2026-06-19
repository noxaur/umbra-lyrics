import { useEffect, useId, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import { LyricsPasteModal } from "@/components/lyrics-paste-modal"
import { PlaylistLyricsImportRowView } from "@/components/playlist-lyrics-import-row"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { getPlaylistById } from "@/lib/playlists"
import {
  commitPlaylistLyricsImportRows,
  preparePlaylistLyricsImportRows,
  rowCanImport,
  rowNeedsAttention,
  rowsFromIndexIssues,
  scanPlaylistLyricsImportRow,
  scanPlaylistLyricsImportRows,
  transcribePlaylistImportRow,
  type PlaylistLyricsImportRow,
} from "@/lib/playlist-lyrics-import"
import { buildPlaylistImportRejectionUrl } from "@/lib/lyrics-rejection-report"
import { clearLyricsRejection, rejectLyrics } from "@/lib/lyrics-rejection"
import { listPlaylistIndexIssues } from "@/lib/playlist-index-issues"

type DialogStep = "scanning" | "review" | "importing"

type PlaylistLyricsImportDialogProps = {
  open: boolean
  playlistId: string
  videoIds?: string[]
  onClose: () => void
  onImported?: () => void
}

function updateRow(
  rows: PlaylistLyricsImportRow[],
  videoId: string,
  patch: Partial<PlaylistLyricsImportRow>,
): PlaylistLyricsImportRow[] {
  return rows.map((row) => (row.videoId === videoId ? { ...row, ...patch } : row))
}

function buildInitialRows(
  playlistId: string,
  videoIds?: string[],
  includeCached = false,
): PlaylistLyricsImportRow[] {
  const playlist = getPlaylistById(playlistId)
  if (!playlist) return []

  const tracks = playlist.tracks.map(({ addedAt: _addedAt, ...track }) => track)
  const issues = listPlaylistIndexIssues().filter((i) => i.playlistId === playlistId)

  if (videoIds?.length) {
    if (issues.some((issue) => videoIds.includes(issue.videoId))) {
      return rowsFromIndexIssues(tracks, issues).filter((row) =>
        videoIds.includes(row.videoId),
      )
    }
    return preparePlaylistLyricsImportRows(
      tracks.filter((track) => videoIds.includes(track.videoId)),
    )
  }

  return preparePlaylistLyricsImportRows(tracks, { includeCached })
}

export function PlaylistLyricsImportDialog({
  open,
  playlistId,
  videoIds,
  onClose,
  onImported,
}: PlaylistLyricsImportDialogProps) {
  const titleId = useId()
  const [step, setStep] = useState<DialogStep>("scanning")
  const [rows, setRows] = useState<PlaylistLyricsImportRow[]>([])
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [bulkArtist, setBulkArtist] = useState("")
  const [includeCached, setIncludeCached] = useState(false)
  const [pasteVideoId, setPasteVideoId] = useState<string | null>(null)
  const scanAbortRef = useRef<AbortController | null>(null)
  const transcribeAbortRef = useRef<AbortController | null>(null)

  const playlist = getPlaylistById(playlistId)
  const playlistName = playlist?.name ?? "Playlist"

  useEffect(() => {
    if (!open) {
      scanAbortRef.current?.abort()
      transcribeAbortRef.current?.abort()
      return
    }

    setError(null)
    setStep("scanning")
    setBulkArtist("")
    setIncludeCached(false)
    const initial = buildInitialRows(playlistId, videoIds)
    setRows(initial)
    setScanProgress({ done: 0, total: initial.length })

    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller

    void scanPlaylistLyricsImportRows(
      initial,
      (done, total) => setScanProgress({ done, total }),
      controller.signal,
    ).then((scanned) => {
      if (controller.signal.aborted) return
      setRows(scanned)
      setStep("review")
    })

    return () => controller.abort()
  }, [open, playlistId, videoIds])

  if (!open || !playlist) return null

  const selectedRows = rows.filter((row) => row.selected)
  const importableCount = selectedRows.filter((row) => rowCanImport(row)).length
  const hasBlockingRows = selectedRows.some((row) => rowNeedsAttention(row))
  const allSelected = rows.length > 0 && rows.every((row) => row.selected || row.status === "cached" || row.status === "rejected")
  const busy = step === "scanning" || step === "importing"

  const close = () => {
    if (busy) return
    onClose()
  }

  const handleImport = () => {
    setStep("importing")
    setError(null)
    const result = commitPlaylistLyricsImportRows(playlistId, rows)
    if (result.failed > 0 && result.imported === 0) {
      setError(result.errors[0] ?? "Import failed")
      setStep("review")
      return
    }
    onImported?.()
    onClose()
  }

  const handleSelectAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((row) =>
        row.status === "cached" || row.status === "rejected" ? row : { ...row, selected: checked },
      ),
    )
  }

  const handleApplyBulkArtist = () => {
    const artist = bulkArtist.trim()
    if (!artist) return
    setRows((prev) =>
      prev.map((row) =>
        row.selected && row.status !== "cached" && row.status !== "rejected"
          ? { ...row, artist }
          : row,
      ),
    )
  }

  const handleRetrySelected = async () => {
    const targets = rows.filter((row) => row.selected && row.status !== "cached")
    for (const row of targets) clearLyricsRejection(row.videoId)
    setStep("scanning")
    const scanned: PlaylistLyricsImportRow[] = []
    for (const row of targets) {
      const result = await scanPlaylistLyricsImportRow({
        ...row,
        status: "pending",
        alternates: [],
        selectedAlternate: undefined,
      })
      scanned.push(result)
    }
    setRows((prev) => {
      const map = new Map(scanned.map((row) => [row.videoId, row]))
      return prev.map((row) => map.get(row.videoId) ?? row)
    })
    setStep("review")
  }

  const handleRetryRow = async (videoId: string) => {
    const row = rows.find((r) => r.videoId === videoId)
    if (!row) return
    clearLyricsRejection(videoId)
    setRows((prev) =>
      updateRow(prev, videoId, { status: "scanning", message: "Searching…", selected: true }),
    )
    const result = await scanPlaylistLyricsImportRow({
      ...row,
      status: "pending",
      alternates: [],
      selectedAlternate: undefined,
    })
    setRows((prev) => updateRow(prev, videoId, result))
  }

  const handleTranscribeRow = async (videoId: string) => {
    const row = rows.find((r) => r.videoId === videoId)
    if (!row) return
    transcribeAbortRef.current?.abort()
    const controller = new AbortController()
    transcribeAbortRef.current = controller
    setRows((prev) =>
      updateRow(prev, videoId, { status: "scanning", message: "Transcribing…" }),
    )
    try {
      const result = await transcribePlaylistImportRow(row, { signal: controller.signal })
      setRows((prev) => updateRow(prev, videoId, result))
    } catch {
      setRows((prev) =>
        updateRow(prev, videoId, {
          status: "error",
          message: "Transcription failed",
        }),
      )
    }
  }

  const handleRejectRow = (videoId: string) => {
    rejectLyrics(videoId)
    setRows((prev) =>
      updateRow(prev, videoId, {
        status: "rejected",
        selected: false,
        selectedAlternate: undefined,
        alternates: [],
        pastedLyrics: undefined,
        transcribedResult: undefined,
        message: "Lyrics rejected — paste or re-match to try again",
      }),
    )
  }

  const handleRejectSelected = () => {
    const targets = rows.filter((row) => row.selected && row.status !== "rejected")
    for (const row of targets) rejectLyrics(row.videoId)
    setRows((prev) =>
      prev.map((row) =>
        targets.some((target) => target.videoId === row.videoId)
          ? {
              ...row,
              status: "rejected" as const,
              selected: false,
              selectedAlternate: undefined,
              alternates: [],
              pastedLyrics: undefined,
              transcribedResult: undefined,
              message: "Lyrics rejected — paste or re-match to try again",
            }
          : row,
      ),
    )
  }

  const handleRejectAllIndexed = () => {
    const targets = rows.filter((row) => row.status === "cached")
    for (const row of targets) rejectLyrics(row.videoId)
    setRows((prev) =>
      prev.map((row) =>
        row.status === "cached"
          ? {
              ...row,
              status: "rejected" as const,
              selected: false,
              selectedAlternate: undefined,
              alternates: [],
              message: "Lyrics rejected — paste or re-match to try again",
            }
          : row,
      ),
    )
  }

  const indexedCount = rows.filter((row) => row.status === "cached").length
  const rejectableSelectedCount = selectedRows.filter((row) => row.status !== "rejected").length

  const handleSelectAlternate = (videoId: string, alternateId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.videoId !== videoId) return row
        const alt = row.alternates.find((a) => String(a.id) === alternateId)
        if (!alt) return row
        return {
          ...row,
          selectedAlternate: alt,
          status: "ready" as const,
          message: undefined,
        }
      }),
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) close()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="flex max-h-[min(90dvh,48rem)] w-full max-w-4xl flex-col rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                Interactive lyrics import — {playlistName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {step === "scanning"
                  ? `Parsing ${scanProgress.done} of ${scanProgress.total} tracks…`
                  : `${importableCount} of ${selectedRows.length} selected ready to import`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={close}
              disabled={busy}
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          {step === "scanning" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Searching lyrics for {scanProgress.total} tracks…
              </p>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-x-2 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all tracks"
                />
                <span>Title</span>
                <span>Artist</span>
                <span>Track</span>
                <span>Source</span>
                <span>Sync</span>
                <span className="text-right">Status</span>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto">
                {rows.map((row) => (
                  <PlaylistLyricsImportRowView
                    key={row.videoId}
                    row={row}
                    busy={busy}
                    onSelect={(selected) =>
                      setRows((prev) => updateRow(prev, row.videoId, { selected }))
                    }
                    onArtistChange={(artist) =>
                      setRows((prev) =>
                        updateRow(prev, row.videoId, {
                          artist,
                          status: (() => {
                            const current = prev.find((r) => r.videoId === row.videoId)?.status
                            if (current === "cached" || current === "rejected") return current
                            return artist.trim() && row.track.trim()
                              ? row.selectedAlternate
                                ? "ready"
                                : row.status
                              : "needs_metadata"
                          })(),
                        }),
                      )
                    }
                    onTrackChange={(track) =>
                      setRows((prev) =>
                        updateRow(prev, row.videoId, {
                          track,
                          status: (() => {
                            const current = prev.find((r) => r.videoId === row.videoId)?.status
                            if (current === "cached" || current === "rejected") return current
                            return track.trim() && row.artist.trim()
                              ? row.selectedAlternate
                                ? "ready"
                                : row.status
                              : "needs_metadata"
                          })(),
                        }),
                      )
                    }
                    onSelectAlternate={(alternateId) =>
                      handleSelectAlternate(row.videoId, alternateId)
                    }
                    onRetry={() => void handleRetryRow(row.videoId)}
                    onPaste={() => setPasteVideoId(row.videoId)}
                    onTranscribe={() => void handleTranscribeRow(row.videoId)}
                    onSkip={() =>
                      setRows((prev) => updateRow(prev, row.videoId, { selected: false }))
                    }
                    onReject={() => handleRejectRow(row.videoId)}
                    rejectionUrl={buildPlaylistImportRejectionUrl(row)}
                  />
                ))}
              </ul>
            </>
          )}

          {error ? (
            <p className="border-t border-border px-4 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={includeCached}
                  onCheckedChange={(checked) => {
                    setIncludeCached(checked)
                    if (checked) {
                      const tracks = playlist.tracks.map(({ addedAt: _addedAt, ...track }) => track)
                      const allRows = preparePlaylistLyricsImportRows(tracks, { includeCached: true })
                      setRows((prev) => {
                        const existing = new Map(prev.map((r) => [r.videoId, r]))
                        return allRows.map((row) => existing.get(row.videoId) ?? row)
                      })
                    } else {
                      setRows((prev) => prev.filter((row) => row.status !== "cached"))
                    }
                  }}
                />
                Show indexed tracks
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={bulkArtist}
                  onChange={(e) => setBulkArtist(e.target.value)}
                  placeholder="Artist for selected"
                  className="h-9 w-40 text-sm"
                  aria-label="Bulk artist"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!bulkArtist.trim() || selectedRows.length === 0}
                  onClick={handleApplyBulkArtist}
                >
                  Apply artist
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedRows.length === 0}
                  onClick={() => void handleRetrySelected()}
                >
                  Retry auto-match
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rejectableSelectedCount === 0}
                  onClick={handleRejectSelected}
                >
                  Reject selected
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={indexedCount === 0}
                  onClick={handleRejectAllIndexed}
                >
                  Reject all indexed
                </Button>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={importableCount === 0 || hasBlockingRows}
                  onClick={handleImport}
                >
                  Import {importableCount > 0 ? importableCount : ""}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "importing" ? (
            <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Importing lyrics…
            </div>
          ) : null}
        </div>
      </div>

      <LyricsPasteModal
        open={pasteVideoId != null}
        onClose={() => setPasteVideoId(null)}
        onSubmit={(text) => {
          if (!pasteVideoId) return
          clearLyricsRejection(pasteVideoId)
          setRows((prev) =>
            updateRow(prev, pasteVideoId, {
              pastedLyrics: text,
              status: "pasted",
              selectedAlternate: undefined,
              alternates: [],
              message: "Pasted lyrics",
              selected: true,
            }),
          )
          setPasteVideoId(null)
        }}
      />
    </>
  )
}
