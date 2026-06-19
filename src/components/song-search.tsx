import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import { LottieIcon } from "@/components/icons/lottie-icon"
import { useNavigate } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSongSearch } from "@/hooks/use-song-search"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { formatSongDuration, formatViewCount, type SongSearchHit } from "@/lib/youtube-search"
import { mediaResolveErrorMessage, resolveMediaInput } from "@/lib/media-url"
import { extractSpotifyTrackId } from "@/lib/spotify-url"
import { buildPlayerNavigationState, type SeedMetadata } from "@/lib/player-navigation"
import { youtubeThumbnailUrl } from "@/lib/youtube-thumbnail"
import { extractYouTubeVideoId, youTubePlaybackEmbedUrl } from "@/lib/youtube-url"

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

function hasPreviewModifier(e: MouseEvent<HTMLButtonElement>): boolean {
  return e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
}

type SearchPreviewModalProps = {
  hit: SongSearchHit
  label: string
  meta: string
  onClose: () => void
}

function SearchPreviewModal({ hit, label, meta, onClose }: SearchPreviewModalProps) {
  const titleId = useId()
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const embedSrc = youTubePlaybackEmbedUrl(hit.videoId, { rel: 0 })

  useEffect(() => {
    requestAnimationFrame(() => backButtonRef.current?.focus())

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      data-testid="search-preview-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Button
            ref={backButtonRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="shrink-0"
          >
            <LottieIcon name="arrow-left" hover className="size-4" aria-hidden />
            Back
          </Button>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-semibold">
              {label}
            </h2>
            <p className="truncate text-sm text-muted-foreground">{meta}</p>
          </div>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-black">
          <img
            src={youtubeThumbnailUrl(hit.videoId, "hqdefault")}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-50"
            aria-hidden
          />
          <iframe
            title={`${label} preview`}
            src={embedSrc}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>
  )
}

export function SongSearch() {
  const [opening, setOpening] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [previewHit, setPreviewHit] = useState<SongSearchHit | null>(null)
  const closePreview = useCallback(() => setPreviewHit(null), [])
  const navigate = useNavigate()
  const listId = useId()
  const optionIdPrefix = useId()
  const resetSearchRef = useRef<() => void>(() => {})
  const clearSearchStateRef = useRef<() => void>(() => {})

  const goToPlayer = useCallback((videoId: string, seedMetadata?: SeedMetadata) => {
    setOpening(true)
    navigate(`/play/${videoId}`, {
      state: buildPlayerNavigationState(true, seedMetadata, {
        canonicalChecked: seedMetadata ? videoId : undefined,
      }),
    })
  }, [navigate])

  const resolveMediaLink = useCallback(async (value: string): Promise<boolean> => {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (!extractYouTubeVideoId(trimmed) && !extractSpotifyTrackId(trimmed)) return false

    setResolving(true)
    setResolveError(null)
    clearSearchStateRef.current()

    try {
      const resolved = await resolveMediaInput(trimmed)
      if (resolved === null) return false
      if (!resolved.ok) {
        setResolveError(mediaResolveErrorMessage(resolved.error))
        return true
      }

      goToPlayer(resolved.result.videoId, resolved.result.seedMetadata)
      return true
    } finally {
      setResolving(false)
    }
  }, [goToPlayer])

  const {
    query,
    setQuery,
    results,
    status,
    error: searchError,
    isSearching,
    submitSearch,
    resetSearch,
    clearSearchState,
  } = useSongSearch({
    limit: 10,
    enabled: !opening,
    beforeSearch: resolveMediaLink,
    emptyMessage:
      "No songs found. Try different keywords or paste a YouTube or Spotify link below.",
    errorMessage:
      "Search unavailable right now. Paste a YouTube or Spotify link below instead.",
  })

  resetSearchRef.current = resetSearch
  clearSearchStateRef.current = clearSearchState

  const optionId = (index: number) => `${optionIdPrefix}-option-${index}`

  useEffect(() => {
    setPreviewHit(null)
  }, [query])

  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1)
  }, [results])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (await resolveMediaLink(query)) return
    submitSearch()
  }

  const onResultClick = (e: MouseEvent<HTMLButtonElement>, hit: SongSearchHit) => {
    if (hasPreviewModifier(e)) {
      e.preventDefault()
      setPreviewHit(hit)
      return
    }

    goToPlayer(hit.videoId)
  }

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((index) => (index < 0 ? 0 : (index + 1) % results.length))
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((index) =>
        index < 0 ? results.length - 1 : index <= 0 ? results.length - 1 : index - 1,
      )
      return
    }

    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      goToPlayer(results[activeIndex].videoId)
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      if (previewHit) {
        closePreview()
        return
      }
      resetSearch()
      setResolveError(null)
    }
  }

  const onPaste = (value: string) => {
    setQuery(value)
    void resolveMediaLink(value)
  }

  const busy = opening || resolving
  const error = resolveError ?? searchError
  const statusMessage = opening
    ? "Opening player…"
    : resolving
      ? "Finding YouTube match…"
      : isSearching
        ? "Searching…"
        : error
          ? error
          : results.length > 0
            ? `${results.length} result${results.length === 1 ? "" : "s"}`
            : status === "idle" && query.trim().length >= 2
              ? ""
              : ""

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            type="search"
            placeholder="Search songs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text")
              setTimeout(() => onPaste(text), 0)
            }}
            disabled={busy}
            aria-invalid={!!error && results.length === 0}
            aria-describedby={statusMessage ? "song-search-status" : undefined}
            aria-controls={results.length > 0 ? listId : undefined}
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={
              activeIndex >= 0 && results.length > 0 ? optionId(activeIndex) : undefined
            }
            role="combobox"
          />
          <Button type="submit" className="shrink-0" disabled={busy || isSearching}>
            <LottieIcon name="search" hover />
            {opening ? "Opening…" : resolving ? "Finding…" : isSearching ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      {statusMessage ? (
        <p
          id="song-search-status"
          className={`text-sm ${error && results.length === 0 ? "text-destructive" : "text-muted-foreground"}`}
          role={error && results.length === 0 ? "alert" : "status"}
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul id={listId} role="listbox" className="divide-y divide-border rounded-lg border border-border bg-card">
          {results.map((hit, index) => {
            const label = formatResultLabel(hit)
            const meta = formatResultMeta(hit)
            const active = index === activeIndex

            return (
              <li key={hit.videoId} role="presentation">
                <button
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={(e) => onResultClick(e, hit)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "bg-accent" : ""
                  }`}
                >
                  <img
                    src={youtubeThumbnailUrl(hit.videoId)}
                    alt=""
                    width={68}
                    height={38}
                    loading="lazy"
                    decoding="async"
                    className="h-[2.375rem] w-[4.25rem] shrink-0 rounded-md border border-border/60 bg-muted object-cover"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{label}</span>
                    <span className="block truncate text-muted-foreground">{meta}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {previewHit ? (
        <SearchPreviewModal
          hit={previewHit}
          label={formatResultLabel(previewHit)}
          meta={formatResultMeta(previewHit)}
          onClose={closePreview}
        />
      ) : null}
    </div>
  )
}
