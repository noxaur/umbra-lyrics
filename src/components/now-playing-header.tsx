import { usePlayerStore } from "@/stores/player-store"
import { LYRICS_PROVIDER_LABELS, type LyricsProviderId } from "@/types/lyrics"

type SyncBadge = "Synced" | "Approximate" | "Plain"

function getSyncBadge(
  status: string,
  lyricsSynced: boolean,
  lyricsCount: number,
  lyricsSource: ReturnType<typeof usePlayerStore.getState>["lyricsSource"],
): SyncBadge | null {
  if (status === "loading") return "Plain"
  if (status !== "ready" || lyricsCount === 0) return null
  if (lyricsSource === "pasted") return "Plain"
  if (lyricsSynced) return "Synced"
  return "Approximate"
}

function getSourceLabel(source: ReturnType<typeof usePlayerStore.getState>["lyricsSource"]): string | null {
  if (!source || source === "pasted") return null
  return LYRICS_PROVIDER_LABELS[source as LyricsProviderId] ?? source
}

const badgeStyles: Record<SyncBadge, string> = {
  Synced: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Approximate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Plain: "bg-muted text-muted-foreground",
}

export function NowPlayingHeader() {
  const track = usePlayerStore((s) => s.track)
  const artist = usePlayerStore((s) => s.artist)
  const title = usePlayerStore((s) => s.title)
  const status = usePlayerStore((s) => s.status)
  const lyricsSynced = usePlayerStore((s) => s.lyricsSynced)
  const lyricsSource = usePlayerStore((s) => s.lyricsSource)
  const lyrics = usePlayerStore((s) => s.lyrics)

  const videoId = usePlayerStore((s) => s.videoId)
  const displayTrack = track || title
  const badge = getSyncBadge(status, lyricsSynced, lyrics.length, lyricsSource)
  const sourceLabel = getSourceLabel(lyricsSource)

  if (!displayTrack && !artist && status === "idle" && !videoId) return null

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 truncate text-base font-semibold leading-tight">
          {displayTrack || "Loading track…"}
        </h1>
        {artist ? (
          <p className="min-w-0 truncate text-sm text-muted-foreground">{artist}</p>
        ) : status === "loading" ? (
          <p className="text-sm text-muted-foreground">Identifying artist…</p>
        ) : null}
        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[badge]}`}
            role="status"
          >
            {badge}
          </span>
        ) : null}
        {sourceLabel ? (
          <span
            className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
            role="status"
            title="Lyrics source"
          >
            {sourceLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}
