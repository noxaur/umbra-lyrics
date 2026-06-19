import { useEffect, useId, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  bulkAddTracksToPlaylist,
  createPlaylistFromImport,
  MAX_TRACKS_PER_PLAYLIST,
} from "@/lib/playlists"
import {
  fetchYouTubePlaylist,
  playlistItemsToTracks,
  type PlaylistImportResponse,
} from "@/lib/youtube-playlist"
import { enqueuePlaylistLyricsIndexing } from "@/lib/playlist-lyrics-indexer"
import { extractYouTubePlaylistId, youTubeMusicPlaylistUrl } from "@/lib/youtube-url"

type PlaylistImportDialogProps = {
  open: boolean
  mode: "new" | "existing"
  targetPlaylistId?: string
  onImported: () => void
  onClose: () => void
}

type DialogStep = "input" | "preview" | "importing"

function formatImportSummary(response: PlaylistImportResponse): string {
  const count = response.items.length
  const noun = count === 1 ? "song" : "songs"
  const total =
    response.totalReported && response.totalReported !== "N/A"
      ? ` (${response.totalReported} on YouTube)`
      : ""
  const truncated = response.truncated ? ` Only the first ${count} can be imported.` : ""
  return `${count} ${noun} found${total}.${truncated}`
}

export function PlaylistImportDialog({
  open,
  mode,
  targetPlaylistId,
  onImported,
  onClose,
}: PlaylistImportDialogProps) {
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [step, setStep] = useState<DialogStep>("input")
  const [preview, setPreview] = useState<PlaylistImportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const urlId = useId()
  const nameId = useId()
  const urlRef = useRef<HTMLInputElement>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      fetchAbortRef.current?.abort()
      fetchAbortRef.current = null
      return
    }
    setUrl("")
    setName("")
    setStep("input")
    setPreview(null)
    setError(null)
    setStatus(null)
    requestAnimationFrame(() => urlRef.current?.focus())
  }, [open])

  if (!open) return null

  const close = () => {
    if (step === "importing") return
    onClose()
  }

  const handleFetch = async () => {
    const trimmed = url.trim()
    if (!extractYouTubePlaylistId(trimmed)) {
      setError("Paste a valid YouTube playlist URL")
      return
    }

    setError(null)
    setStatus("Loading playlist from YouTube…")
    setStep("input")

    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    try {
      const response = await fetchYouTubePlaylist(trimmed, { signal: controller.signal })
      if (response.items.length === 0) {
        setError("This playlist has no importable videos")
        setStatus(null)
        return
      }

      setPreview(response)
      if (mode === "new" && !name.trim()) {
        setName(response.title)
      }
      setStep("preview")
      setStatus(null)
    } catch (err) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : "Could not load playlist"
      setError(
        message === "invalid_playlist_url"
          ? "Paste a valid YouTube playlist URL"
          : message,
      )
      setStatus(null)
    }
  }

  const handleImport = async () => {
    if (!preview) return
    if (mode === "existing" && !targetPlaylistId) {
      setError("Playlist not found")
      return
    }

    const tracks = playlistItemsToTracks(preview.items)
    setStep("importing")
    setError(null)
    setStatus("Adding songs to playlist…")

    const result =
      mode === "existing" && targetPlaylistId
        ? bulkAddTracksToPlaylist(targetPlaylistId, tracks)
        : createPlaylistFromImport(name.trim() || preview.title, tracks)

    if (result.error && result.added === 0) {
      setError(result.error)
      setStep("preview")
      setStatus(null)
      return
    }

    const parts = [`Imported ${result.added} ${result.added === 1 ? "song" : "songs"}`]
    if (result.skippedDuplicates > 0) {
      parts.push(`${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"}`)
    }
    if (result.truncated > 0) {
      parts.push(`${result.truncated} skipped (playlist limit is ${MAX_TRACKS_PER_PLAYLIST})`)
    }

    setStatus(parts.join(". ") + ".")
    const playlistId =
      mode === "existing" && targetPlaylistId ? targetPlaylistId : result.playlist?.id
    if (playlistId) {
      const indexTracks = preview.items.map((item) => {
        const [track] = playlistItemsToTracks([item])
        return { ...track, durationSec: item.durationSec }
      })
      enqueuePlaylistLyricsIndexing(playlistId, indexTracks)
    }
    onImported()
    onClose()
  }

  const busy = step === "importing" || status?.startsWith("Loading") === true

  return (
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
        aria-labelledby={`${urlId}-title`}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-lg"
      >
        <h2 id={`${urlId}-title`} className="text-lg font-semibold">
          Import from YouTube
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a public YouTube or YouTube Music playlist link.
          {mode === "existing" ? " Songs are added to this playlist." : " A new playlist is created."}
        </p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (busy) return
            if (step === "preview") {
              void handleImport()
            } else if (url.trim()) {
              void handleFetch()
            }
          }}
        >
          {step !== "preview" ? (
            <div>
              <label htmlFor={urlId} className="text-sm font-medium">
                Playlist URL
              </label>
              <Input
                ref={urlRef}
                id={urlId}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={`${youTubeMusicPlaylistUrl("PL…")}`}
                className="mt-1.5"
                disabled={busy}
              />
            </div>
          ) : null}

          {mode === "new" && step === "preview" ? (
            <div>
              <label htmlFor={nameId} className="text-sm font-medium">
                Playlist name
              </label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Imported playlist"
                className="mt-1.5"
                maxLength={80}
                disabled={busy}
              />
            </div>
          ) : null}

          {preview && step === "preview" ? (
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium">{preview.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{formatImportSummary(preview)}</p>
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
                {preview.items.slice(0, 8).map((item) => (
                  <li key={item.videoId} className="truncate text-muted-foreground">
                    {item.title}
                  </li>
                ))}
                {preview.items.length > 8 ? (
                  <li className="text-xs text-muted-foreground">
                    + {preview.items.length - 8} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {status ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {status}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            {step === "preview" ? (
              <Button type="button" variant="outline" onClick={() => setStep("input")} disabled={busy}>
                Back
              </Button>
            ) : null}
            {step === "preview" ? (
              <Button type="submit" disabled={busy}>
                Import
              </Button>
            ) : (
              <Button type="submit" disabled={busy || !url.trim()}>
                {busy ? "Loading…" : "Load playlist"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
