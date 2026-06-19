import { useEffect, useState } from "react"
import { PlaylistLyricsImportDialog } from "@/components/playlist-lyrics-import-dialog"
import {
  clearPlaylistLyricsImportRequest,
  subscribePlaylistLyricsImportOpen,
  type OpenPlaylistLyricsImportRequest,
} from "@/lib/playlist-lyrics-import-open"

export function PlaylistLyricsImportHost() {
  const [request, setRequest] = useState<OpenPlaylistLyricsImportRequest | null>(null)

  useEffect(() => subscribePlaylistLyricsImportOpen(setRequest), [])

  if (!request) return null

  return (
    <PlaylistLyricsImportDialog
      open
      playlistId={request.playlistId}
      videoIds={request.videoIds}
      onClose={clearPlaylistLyricsImportRequest}
      onImported={clearPlaylistLyricsImportRequest}
    />
  )
}
