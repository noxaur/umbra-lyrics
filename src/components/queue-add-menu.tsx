import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { Link2, ListPlus, Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  searchSongs,
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

const DEBOUNCE_MS = 500
const MIN_QUERY_LEN = 2
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
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SongSearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [autoApprove, setAutoApprove] = useState(() => readQueueSettings().autoApproveMetadata)
  const [addingCurrent, setAddingCurrent] = useState(false)
  const searchRequestId = useRef(0)
  const listId = useId()

  const handleAutoApproveChange = (checked: boolean) => {
    setAutoApprove(checked)
    setAutoApproveMetadata(checked)
  }

  const handleUrlSubmit = async (e?: FormEvent) => {
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

  const runSearch = useCallback(async (value: string, signal?: AbortSignal) => {
    const trimmed = value.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }

    const requestId = ++searchRequestId.current
    setSearchLoading(true)
    setSearchError(null)

    try {
      const hits = await searchSongs(trimmed, { limit: 8, signal })
      if (requestId !== searchRequestId.current) return
      setSearchResults(hits)
      if (hits.length === 0) setSearchError("No songs found")
    } catch (err) {
      if (requestId !== searchRequestId.current) return
      if (err instanceof DOMException && err.name === "AbortError") return
      setSearchResults([])
      setSearchError("Search unavailable")
    } finally {
      if (requestId === searchRequestId.current) setSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void runSearch(trimmed, controller.signal)
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery, runSearch])

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
      setSearchQuery("")
      setSearchResults([])
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(ICON_BTN, className)}
          aria-label="Add to queue"
          title="Add to queue"
        >
          <ListPlus className="size-3.5" aria-hidden />
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
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Add current song
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Link2 className="size-4" aria-hidden />
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
            <Search className="size-4" aria-hidden />
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
              ) : searchQuery.trim().length >= MIN_QUERY_LEN ? null : (
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
