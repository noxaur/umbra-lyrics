import { useId, useState, type KeyboardEvent } from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSongSearch } from "@/hooks/use-song-search"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { parseTrackTitle } from "@/lib/parse-track-title"
import {
  formatSongDuration,
  formatViewCount,
  type SongSearchHit,
} from "@/lib/youtube-search"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"
import {
  readQueueSettings,
  setAutoApproveMetadata,
} from "@/lib/song-queue-settings"
import {
  submitCurrentTrackToQueue,
  submitQueueFromSearch,
  submitQueueFromUrl,
} from "@/lib/song-queue-worker"
import { usePlayerStore } from "@/stores/player-store"
import { cn } from "@/lib/utils"

const ICON_BTN = "size-8 min-h-8 min-w-8 shrink-0"

function formatResultLabel(hit: SongSearchHit): string {
  const { artist, track } = parseTrackTitle(hit.title)
  if (artist && track) return `${artist} · ${track}`
  return hit.title
}

function formatResultMeta(hit: SongSearchHit): string {
  const parts = [hit.channel]
  const duration = formatSongDuration(hit.durationSec)
  const views = formatViewCount(hit.viewCount)
  if (duration) parts.push(duration)
  if (views) parts.push(views)
  return parts.filter(Boolean).join(" · ")
}

export function QueueAddMenu({ className }: { className?: string }) {
  const videoId = usePlayerStore((s) => s.videoId)
  const title = usePlayerStore((s) => s.title)
  const artist = usePlayerStore((s) => s.artist)
  const track = usePlayerStore((s) => s.track)

  const [url, setUrl] = useState("")
  const [urlBusy, setUrlBusy] = useState(false)
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isSearching: searchLoading,
    error: searchError,
    clearResults: clearQueueSearch,
  } = useSongSearch({
    debounceMs: 500,
    limit: 8,
    emptyMessage: "No songs found",
    errorMessage: "Search unavailable",
  })
  const [autoApprove, setAutoApprove] = useState(() => readQueueSettings().autoApproveMetadata)
  const [addingCurrent, setAddingCurrent] = useState(false)
  const listId = useId()

  const handleAutoApproveChange = (checked: boolean) => {
    setAutoApprove(checked)
    setAutoApproveMetadata(checked)
  }

  const handleUrlSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const value = url.trim()
    if (!value || urlBusy) return
    setUrlBusy(true)
    try {
      const result = await submitQueueFromUrl(value)
      if (result.ok) setUrl("")
    } finally {
      setUrlBusy(false)
    }
  }

  const handleSearchPick = async (hit: SongSearchHit) => {
    await submitQueueFromSearch(hit)
  }

  const handleAddCurrent = async () => {
    if (!videoId || addingCurrent) return
    setAddingCurrent(true)
    try {
      await submitCurrentTrackToQueue({ videoId, title, artist, track })
    } finally {
      setAddingCurrent(false)
    }
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      clearQueueSearch()
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setAutoApprove(readQueueSettings().autoApproveMetadata)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(ICON_BTN, className)}
          aria-label="Add to queue"
          title="Add to queue"
        >
          <LottieIcon name="list-plus" className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Add to queue</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {videoId ? (
          <>
            <DropdownMenuItem
              disabled={addingCurrent}
              onSelect={(e) => {
                e.preventDefault()
                void handleAddCurrent()
              }}
            >
              {addingCurrent ? (
                <LottieIcon name="loader" className="size-4" spin aria-hidden />
              ) : (
                <LottieIcon name="plus" className="size-4" aria-hidden />
              )}
              Add current song
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LottieIcon name="link-2" className="size-4" aria-hidden />
            Paste URL
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-72 p-2">
            <form className="flex flex-col gap-2" onSubmit={(e) => void handleUrlSubmit(e)}>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="YouTube or Spotify link"
                disabled={urlBusy}
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" disabled={urlBusy || !url.trim()}>
                {urlBusy ? "Resolving…" : "Add to queue"}
              </Button>
            </form>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LottieIcon name="search" className="size-4" aria-hidden />
            Search songs
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-80 p-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search songs…"
              className="h-8 text-xs"
              aria-controls={searchResults.length > 0 ? listId : undefined}
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {searchLoading ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">Searching…</p>
              ) : searchError ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">{searchError}</p>
              ) : searchResults.length > 0 ? (
                <ul id={listId} className="divide-y divide-border">
                  {searchResults.map((hit) => (
                    <li key={hit.videoId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-1 py-2 text-left text-xs hover:bg-accent"
                        onClick={() => void handleSearchPick(hit)}
                      >
                        <img
                          src={youtubeThumbnailUrl(hit.videoId)}
                          alt=""
                          width={48}
                          height={27}
                          className="h-[1.7rem] w-[3rem] shrink-0 rounded border border-border/60 object-cover"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{formatResultLabel(hit)}</span>
                          <span className="block truncate text-muted-foreground">
                            {formatResultMeta(hit)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searchQuery.trim().length >= 2 ? null : (
                <p className="px-1 py-2 text-xs text-muted-foreground">Type at least 2 characters</p>
              )}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={autoApprove}
          onCheckedChange={(checked) => handleAutoApproveChange(checked === true)}
          onSelect={(e) => e.preventDefault()}
        >
          Auto-approve title & artist
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
