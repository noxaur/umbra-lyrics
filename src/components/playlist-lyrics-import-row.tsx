import { AlertCircle, Ban, CheckCircle2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { PlaylistLyricsImportRow } from "@/lib/playlist-lyrics-import"
import { rowCanImport, rowNeedsAttention } from "@/lib/playlist-lyrics-import"
import { cn } from "@/lib/utils"
import { LYRICS_PROVIDER_LABELS } from "@/types/lyrics"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"

const requiredFieldClass =
  "border-dashed border-destructive/70 bg-destructive/5 focus-visible:ring-destructive/40"

type PlaylistLyricsImportRowProps = {
  row: PlaylistLyricsImportRow
  onSelect: (selected: boolean) => void
  onArtistChange: (artist: string) => void
  onTrackChange: (track: string) => void
  onSelectAlternate: (alternateId: string) => void
  onRetry: () => void
  onPaste: () => void
  onTranscribe: () => void
  onSkip: () => void
  onReject: () => void
  rejectionUrl?: string | null
  busy?: boolean
}

function sourceLabel(row: PlaylistLyricsImportRow): string {
  if (row.status === "pasted") return "Pasted"
  if (row.status === "transcribed") return "Transcribed"
  if (row.selectedAlternate) {
    return LYRICS_PROVIDER_LABELS[row.selectedAlternate.providerId] ?? row.selectedAlternate.providerId
  }
  return "Select source"
}

export function PlaylistLyricsImportRowView({
  row,
  onSelect,
  onArtistChange,
  onTrackChange,
  onSelectAlternate,
  onRetry,
  onPaste,
  onTranscribe,
  onSkip,
  onReject,
  rejectionUrl,
  busy = false,
}: PlaylistLyricsImportRowProps) {
  const isCached = row.status === "cached"
  const isRejected = row.status === "rejected"
  const needsArtist = row.selected && !row.artist.trim()
  const needsTrack = row.selected && !row.track.trim()
  const needsSource =
    row.selected &&
    !isCached &&
    row.status !== "pasted" &&
    row.status !== "transcribed" &&
    !row.selectedAlternate
  const canImport = rowCanImport(row)
  const needsAttention = rowNeedsAttention(row)

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2 border-b border-border px-3 py-2 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]",
        row.status === "scanning" && "opacity-70",
      )}
    >
      <Checkbox
        checked={row.selected}
        disabled={busy || isCached || isRejected}
        onCheckedChange={onSelect}
        aria-label={`Select ${row.title}`}
        className="row-span-1 sm:row-span-1"
      />

      <div className="col-span-1 flex min-w-0 items-center gap-2 sm:col-span-1">
        <img
          src={youtubeThumbnailUrl(row.videoId)}
          alt=""
          width={52}
          height={29}
          className="hidden h-[1.8rem] w-[3.25rem] shrink-0 rounded border border-border/60 bg-muted object-cover sm:block"
          aria-hidden
        />
        <span className="min-w-0 truncate text-sm" title={row.title}>
          {row.title}
        </span>
      </div>

      <Input
        value={row.artist}
        onChange={(e) => onArtistChange(e.target.value)}
        placeholder="Artist"
        aria-label={`Artist for ${row.title}`}
        disabled={busy || isCached || isRejected || !row.selected}
        className={cn("h-9 text-sm", needsArtist && requiredFieldClass)}
      />

      <Input
        value={row.track}
        onChange={(e) => onTrackChange(e.target.value)}
        placeholder="Track"
        aria-label={`Track for ${row.title}`}
        disabled={busy || isCached || isRejected || !row.selected}
        className={cn("h-9 text-sm", needsTrack && requiredFieldClass)}
      />

      {row.alternates.length > 0 || row.status === "pasted" || row.status === "transcribed" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || isCached || isRejected || !row.selected}
              className={cn(
                "h-9 min-w-0 justify-between truncate text-xs font-normal",
                needsSource && requiredFieldClass,
              )}
            >
              <span className="truncate">{sourceLabel(row)}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
            {row.alternates.map((alt) => (
              <DropdownMenuItem
                key={`${alt.providerId}-${alt.id}`}
                onSelect={() => onSelectAlternate(String(alt.id))}
              >
                <span className="font-medium">
                  {LYRICS_PROVIDER_LABELS[alt.providerId] ?? alt.providerId}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {alt.synced ? "synced" : "plain"}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className={cn("h-9 text-xs font-normal", needsSource && requiredFieldClass)}
        >
          {isCached ? "Indexed" : isRejected ? "Rejected" : "No match"}
        </Button>
      )}

      <span className="hidden text-xs text-muted-foreground sm:inline">
        {row.selectedAlternate?.synced
          ? "Synced"
          : row.status === "transcribed" || row.status === "pasted"
            ? "Plain"
            : row.status === "cached"
              ? "—"
              : row.status === "rejected"
                ? "—"
                : "—"}
      </span>

      <div className="flex items-center justify-end gap-1">
        {isCached ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-label="Already indexed" />
        ) : isRejected ? (
          <Ban className="size-4 text-muted-foreground" aria-label="Lyrics rejected" />
        ) : needsAttention ? (
          <AlertCircle className="size-4 text-destructive" aria-label="Needs attention" />
        ) : canImport ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-label="Ready to import" />
        ) : null}

        {!isCached ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={busy}
                aria-label={`Actions for ${row.title}`}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isRejected ? (
                <>
                  <DropdownMenuItem onSelect={onRetry}>Retry auto-match</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onPaste}>Paste lyrics</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onTranscribe}>Transcribe</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onSkip}>Skip</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onReject}>Reject lyrics</DropdownMenuItem>
                  {rejectionUrl ? (
                    <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                      <a
                        href={rejectionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        Report on GitHub
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={onRetry}>Try again</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onPaste}>Paste lyrics</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={busy}
                aria-label={`Actions for ${row.title}`}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onReject}>Reject lyrics</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  )
}
