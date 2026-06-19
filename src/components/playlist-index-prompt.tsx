import { useEffect, useState } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import {
  listPlaylistIndexIssues,
  subscribePlaylistIndexIssues,
  type PlaylistIndexIssue,
} from "@/lib/playlist-index-issues"
import { openPlaylistLyricsImport } from "@/lib/playlist-lyrics-import-open"

export function PlaylistIndexPrompt() {
  const [issues, setIssues] = useState<PlaylistIndexIssue[]>(() => listPlaylistIndexIssues())

  useEffect(() => subscribePlaylistIndexIssues(() => setIssues(listPlaylistIndexIssues())), [])

  if (issues.length === 0) return null

  const byPlaylist = new Map<string, PlaylistIndexIssue[]>()
  for (const issue of issues) {
    const list = byPlaylist.get(issue.playlistId) ?? []
    list.push(issue)
    byPlaylist.set(issue.playlistId, list)
  }

  const primaryPlaylistId = issues[0].playlistId
  const primaryCount = byPlaylist.get(primaryPlaylistId)?.length ?? issues.length

  return (
    <div className="fixed inset-x-0 bottom-0 z-modal border-t border-amber-500/40 bg-amber-50/95 p-4 shadow-lg backdrop-blur-sm dark:bg-amber-950/90">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-950 dark:text-amber-50">
            <LottieIcon name="alert-triangle" className="size-4 shrink-0" aria-hidden />
            Lyrics indexing needs help
          </p>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
            {issues.length} {issues.length === 1 ? "track needs" : "tracks need"} attention across{" "}
            {byPlaylist.size} {byPlaylist.size === 1 ? "playlist" : "playlists"}.
            {primaryCount > 0 ? ` ${primaryCount} in the most recent playlist.` : ""}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              openPlaylistLyricsImport({
                playlistId: primaryPlaylistId,
                videoIds: issues
                  .filter((issue) => issue.playlistId === primaryPlaylistId)
                  .map((issue) => issue.videoId),
              })
            }
          >
            Open interactive import
          </Button>
        </div>
      </div>
    </div>
  )
}
