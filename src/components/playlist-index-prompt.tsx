import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  listPlaylistIndexIssues,
  subscribePlaylistIndexIssues,
  type PlaylistIndexIssue,
} from "@/lib/playlist-index-issues"
import { getPlaylistById, updatePlaylistTrackMetadata } from "@/lib/playlists"
import { retryPlaylistTrackIndexing } from "@/lib/playlist-lyrics-indexer"

export function PlaylistIndexPrompt() {
  const [issues, setIssues] = useState<PlaylistIndexIssue[]>(() => listPlaylistIndexIssues())
  const [active, setActive] = useState<PlaylistIndexIssue | null>(() => listPlaylistIndexIssues()[0] ?? null)
  const [artist, setArtist] = useState("")
  const [track, setTrack] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribePlaylistIndexIssues(() => setIssues(listPlaylistIndexIssues())), [])

  useEffect(() => {
    if (issues.length === 0) {
      setActive(null)
      return
    }
    if (!active || !issues.some((issue) => issue.videoId === active.videoId)) {
      setActive(issues[0])
    }
  }, [issues, active])

  useEffect(() => {
    if (!active) return
    setArtist(active.artist)
    setTrack(active.track)
  }, [active])

  if (!active) return null

  const playlist = getPlaylistById(active.playlistId)
  const playlistName = playlist?.name ?? "playlist"

  const handleRetry = async () => {
    const nextArtist = artist.trim()
    const nextTrack = track.trim()
    if (!nextTrack) return

    setBusy(true)
    updatePlaylistTrackMetadata(active.playlistId, active.videoId, {
      title: active.title,
      artist: nextArtist,
      track: nextTrack,
    })

    await retryPlaylistTrackIndexing(active.playlistId, {
      videoId: active.videoId,
      title: active.title,
      artist: nextArtist,
      track: nextTrack,
    })
    setBusy(false)
  }

  const needsMetadata = active.reason === "needs_metadata"

  return (
    <div className="fixed inset-x-0 bottom-0 z-modal border-t border-amber-500/40 bg-amber-50/95 p-4 shadow-lg backdrop-blur-sm dark:bg-amber-950/90">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-950 dark:text-amber-50">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Lyrics indexing needs help
          </p>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
            {needsMetadata
              ? `“${active.title}” in ${playlistName} needs artist/track details before lyrics can be indexed.`
              : `“${active.title}” in ${playlistName}: ${active.message}`}
          </p>
          {issues.length > 1 ? (
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
              {issues.length - 1} more {issues.length - 1 === 1 ? "track needs" : "tracks need"} attention after this one.
            </p>
          ) : null}
        </div>

        <form
          className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[20rem]"
          onSubmit={(e) => {
            e.preventDefault()
            void handleRetry()
          }}
        >
          {needsMetadata ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist"
                aria-label="Artist"
                disabled={busy}
              />
              <Input
                value={track}
                onChange={(e) => setTrack(e.target.value)}
                placeholder="Track title"
                aria-label="Track title"
                disabled={busy}
                required
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            {issues.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const index = issues.findIndex((issue) => issue.videoId === active.videoId)
                  const next = issues[(index + 1) % issues.length]
                  setActive(next)
                }}
              >
                Next
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={busy || (needsMetadata && !track.trim())}>
              {busy ? "Retrying…" : needsMetadata ? "Save & index" : "Retry indexing"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
