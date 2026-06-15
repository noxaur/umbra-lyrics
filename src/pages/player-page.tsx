import { useCallback, useEffect, useRef } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { LyricsStage } from "@/components/lyrics-stage"
import { NowPlayingHeader } from "@/components/now-playing-header"
import { PlayerError } from "@/components/player-error"
import { TransportControls } from "@/components/transport-controls"
import { YouTubePanel } from "@/components/youtube-panel"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { useLyricsSync } from "@/hooks/use-lyrics-sync"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useTranslation } from "@/hooks/use-translation"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { getLyricsCache, setLyricsCache } from "@/lib/lyrics-cache"
import { searchEnglishLyrics } from "@/lib/lyrics-service"
import { detectLanguage, isEnglish } from "@/lib/language-service"
import { translateLinesWithFallback } from "@/lib/translation-service"
import { getPastedLyrics, savePastedLyrics } from "@/lib/pasted-lyrics"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { addRecentSong } from "@/lib/recent-songs"
import { fetchYouTubeAuthor } from "@/lib/youtube-oembed"
import { usePlayerStore, type LyricsSource } from "@/stores/player-store"
import type { LyricLine, LyricsAlternate, LyricsProviderId } from "@/types/lyrics"

function applyLyricsText(
  text: string,
  durationSec: number,
): { lines: LyricLine[]; synced: boolean; autoTimed?: boolean } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const durationMs = durationSec * 1000
  const fromLrc = parseLrc(trimmed, durationMs)
  if (fromLrc.lines.length > 0) return fromLrc

  const fromPlain = parsePlainLyrics(trimmed, durationMs)
  if (fromPlain.lines.length > 0) return fromPlain

  return null
}

/** Minimum embed size YouTube needs to start playback while visually hidden. */
const HIDDEN_EMBED_CLASS = "w-[320px] h-[180px]"

export function PlayerPage() {
  const { videoId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const debugPlayer = searchParams.get("debug") === "1"
  const location = useLocation()
  const fromHome = Boolean(
    (location.state as { fromHome?: boolean } | null)?.fromHome,
  )
  const loadedRef = useRef(false)
  const oembedAuthorRef = useRef<string | null>(null)
  const {
    containerRef,
    ready,
    currentTime,
    duration,
    isPlaying,
    error: youtubeError,
    playbackHint,
    play,
    pause,
    seekTo,
    getVideoTitle,
  } = useYouTubePlayer(videoId)

  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const status = usePlayerStore((s) => s.status)
  const setVideoId = usePlayerStore((s) => s.setVideoId)
  const setStatus = usePlayerStore((s) => s.setStatus)
  const setMeta = usePlayerStore((s) => s.setMeta)
  const setLyrics = usePlayerStore((s) => s.setLyrics)
  const setEnglishLines = usePlayerStore((s) => s.setEnglishLines)
  const setLanguageCode = usePlayerStore((s) => s.setLanguageCode)
  const setDisplayMode = usePlayerStore((s) => s.setDisplayMode)
  const setLyricsOutcome = usePlayerStore((s) => s.setLyricsOutcome)
  const setLrclibTrackId = usePlayerStore((s) => s.setLrclibTrackId)
  const setLoadedFromCache = usePlayerStore((s) => s.setLoadedFromCache)
  const resetLyricsSearch = usePlayerStore((s) => s.resetLyricsSearch)
  const setLyricsSearchPhase = usePlayerStore((s) => s.setLyricsSearchPhase)
  const setLyricsSearchStep = usePlayerStore((s) => s.setLyricsSearchStep)
  const setLyricsAlternates = usePlayerStore((s) => s.setLyricsAlternates)
  const setLyricsProvidersSearched = usePlayerStore((s) => s.setLyricsProvidersSearched)
  const addLyricsAttempt = usePlayerStore((s) => s.addLyricsAttempt)
  const setNetworkRetryCount = usePlayerStore((s) => s.setNetworkRetryCount)
  const bindControls = usePlayerStore((s) => s.bindControls)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const lyrics = usePlayerStore((s) => s.lyrics)

  const { available, translating } = useTranslation(languageCode)

  const getTime = useCallback(() => currentTime, [currentTime])
  useLyricsSync(getTime)
  useKeyboardShortcuts()

  useEffect(() => {
    bindControls({ play, pause, seek: seekTo, isPlaying })
  }, [bindControls, play, pause, seekTo, isPlaying])

  useEffect(() => {
    if (!videoId) return
    setVideoId(videoId)
    loadedRef.current = false
    oembedAuthorRef.current = null
    resetLyricsSearch()
    setStatus("idle")
    setLyrics([], true, null)
    setEnglishLines([])
    setMeta({ title: "", artist: "", track: "" })
    setLoadedFromCache(false)
    setLrclibTrackId(null)

    const pasted = getPastedLyrics(videoId)
    const cached = pasted ? null : getLyricsCache(videoId)
    if (cached) {
      setMeta({
        title: cached.title,
        artist: cached.artist,
        track: cached.track,
      })
      setLyrics(
        cached.lines,
        cached.synced,
        cached.providerId ?? cached.lyricsResult.providerId,
        cached.autoTimed ?? (!cached.synced && cached.lines.length > 0),
      )
      setEnglishLines(
        cached.englishLines,
        cached.englishSource ?? (cached.englishLines.length > 0 ? "found" : null),
        cached.translationBackend ?? null,
      )
      setLanguageCode(cached.languageCode)
      setLyricsAlternates(cached.alternates ?? [])
      setLrclibTrackId(
        typeof cached.lyricsResult.id === "number" ? cached.lyricsResult.id : null,
      )
      setLyricsOutcome("found")
      setStatus("ready")
      setLoadedFromCache(true)
      loadedRef.current = true
      addRecentSong({
        videoId,
        title: cached.title,
        artist: cached.artist,
        track: cached.track,
      })
    }

    void fetchYouTubeAuthor(videoId).then((author) => {
      oembedAuthorRef.current = author
    })
  }, [
    videoId,
    setVideoId,
    setStatus,
    setLyrics,
    setEnglishLines,
    setMeta,
    setLanguageCode,
    setLrclibTrackId,
    setLyricsOutcome,
    resetLyricsSearch,
    setLoadedFromCache,
    setLyricsAlternates,
  ])

  const loadEnglishTranslation = useCallback(
    async (
      track: string,
      artist: string,
      durationSec: number,
      sample: string,
      lyricLines: string[],
    ) => {
      const lang = detectLanguage(sample)
      setLanguageCode(lang)
      if (isEnglish(lang)) return

      const enResult = await searchEnglishLyrics(track, artist, Math.round(durationSec))
      if (enResult?.plainLyrics) {
        const lines = enResult.plainLyrics.split("\n").filter(Boolean)
        setEnglishLines(lines, "found", null)
        setDisplayMode("both")
        const cached = getLyricsCache(videoId)
        if (cached) {
          setLyricsCache({ ...cached, englishLines: lines, englishSource: "found", translationBackend: null })
        }
        return
      }

      const translated = await translateLinesWithFallback(lyricLines, {
        sourceLang: lang,
        videoId,
      })
      if (!translated) return

      setEnglishLines(translated.lines, "translated", translated.backend)
      setDisplayMode("both")

      const cached = getLyricsCache(videoId)
      if (cached) {
        setLyricsCache({
          ...cached,
          englishLines: translated.lines,
          englishSource: "translated",
          translationBackend: translated.backend,
        })
      }
    },
    [videoId, setEnglishLines, setLanguageCode, setDisplayMode],
  )

  const applyParsedLyrics = useCallback(
    async (
      parsed: { lines: LyricLine[]; synced: boolean; autoTimed?: boolean },
      source: LyricsSource,
      meta: { title: string; track: string; artist: string },
      durationSec: number,
      sample: string,
      cachePayload?: Parameters<typeof setLyricsCache>[0],
      fromCache = false,
    ) => {
      setLyrics(parsed.lines, parsed.synced, source, parsed.autoTimed ?? false)
      setLyricsOutcome("found")
      setLyricsSearchPhase(source === "pasted" ? "Using pasted lyrics" : "Ready")
      setLyricsSearchStep("ready")
      if (fromCache) setLoadedFromCache(true)
      addRecentSong({
        videoId,
        title: meta.title || meta.track,
        artist: meta.artist,
        track: meta.track,
      })
      setStatus("ready")
      if (cachePayload) setLyricsCache(cachePayload)
      void loadEnglishTranslation(
        meta.track,
        meta.artist,
        durationSec,
        sample,
        parsed.lines.map((l) => l.text),
      )
    },
    [
      videoId,
      setLyrics,
      setLyricsOutcome,
      setLyricsSearchPhase,
      setLyricsSearchStep,
      setStatus,
      setLoadedFromCache,
      loadEnglishTranslation,
    ],
  )

  const applyLyricsFromRaw = useCallback(
    async (
      lyricsResult: {
        providerId: LyricsProviderId
        plainLyrics: string | null
        syncedLyrics: string | null
        id: number | string
      },
      meta: { title: string; track: string; artist: string },
      durationSec: number,
      alternates: LyricsAlternate[] = [],
    ) => {
      let parsed =
        lyricsResult.syncedLyrics?.trim()
          ? parseLrc(lyricsResult.syncedLyrics, durationSec * 1000)
          : lyricsResult.plainLyrics
            ? parsePlainLyrics(lyricsResult.plainLyrics, durationSec * 1000)
            : { lines: [], synced: false, autoTimed: false }

      if (parsed.lines.length === 0 && lyricsResult.plainLyrics) {
        parsed = parsePlainLyrics(lyricsResult.plainLyrics, durationSec * 1000)
      }

      if (parsed.lines.length === 0) {
        setLyricsOutcome("partial")
        setStatus("error", "Lyrics were found but contain no lines to display")
        return false
      }

      const sample = lyricsResult.plainLyrics ?? parsed.lines.map((l) => l.text).join("\n")
      const lang = detectLanguage(sample)
      setLyricsAlternates(alternates)

      await applyParsedLyrics(
        parsed,
        lyricsResult.providerId,
        meta,
        durationSec,
        sample,
        {
          videoId,
          lyricsResult,
          providerId: lyricsResult.providerId,
          lines: parsed.lines,
          synced: parsed.synced,
          autoTimed: parsed.autoTimed ?? false,
          alternates,
          englishLines: [],
          languageCode: lang,
          title: meta.title,
          artist: meta.artist,
          track: meta.track,
        },
      )
      return true
    },
    [videoId, applyParsedLyrics, setLyricsAlternates, setLyricsOutcome, setStatus],
  )

  const loadLyrics = useCallback(
    async (
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      options?: { skipPasted?: boolean; skipCache?: boolean; providerIds?: LyricsProviderId[] },
    ) => {
      resetLyricsSearch()
      setStatus("loading")
      setLyricsSearchPhase("Parsing title…")
      setLyricsSearchStep("parse")
      setMeta({ title, artist, track })

      if (!options?.skipPasted) {
        const pasted = getPastedLyrics(videoId)
        if (pasted) {
          const parsed = applyLyricsText(pasted, durationSec)
          if (parsed) {
            await applyParsedLyrics(
              parsed,
              "pasted",
              { title, track, artist },
              durationSec,
              pasted,
            )
            return
          }
        }
      }

      if (!options?.skipCache) {
        const cached = getLyricsCache(videoId)
        if (cached) {
          setMeta({
            title: cached.title || title,
            artist: cached.artist || artist,
            track: cached.track || track,
          })
          setEnglishLines(cached.englishLines)
          setLanguageCode(cached.languageCode)
          setLyricsAlternates(cached.alternates ?? [])
          await applyParsedLyrics(
            { lines: cached.lines, synced: cached.synced },
            cached.providerId ?? cached.lyricsResult.providerId,
            {
              title: cached.title || title,
              track: cached.track || track,
              artist: cached.artist || artist,
            },
            durationSec,
            cached.lyricsResult.plainLyrics ?? cached.lines.map((l) => l.text).join("\n"),
            undefined,
            true,
          )
          return
        }
      }

      try {
        const result = await orchestrateLyricsSearch({
          track,
          artist,
          title,
          durationSec: Math.round(durationSec) || 0,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
          preferredLanguage: usePlayerStore.getState().languageCode,
          providerIds: options?.providerIds,
          onProgress: ({ phase, step, retryRound, providersTried }) => {
            setLyricsSearchPhase(phase)
            setLyricsSearchStep(step)
            if (providersTried) setLyricsProvidersSearched(providersTried)
            if (retryRound) setNetworkRetryCount(retryRound)
          },
        })

        setLyricsProvidersSearched(result.providersTried)

        for (const attempt of result.attempts) {
          if (attempt.result !== "skipped") {
            addLyricsAttempt(attempt.provider ? `${attempt.provider}:${attempt.strategy}` : attempt.strategy)
          }
        }

        if (typeof result.matchId === "number") setLrclibTrackId(result.matchId)
        else setLrclibTrackId(null)

        if ((result.status === "found" || result.status === "instrumental") && result.lyrics) {
          const applied = await applyLyricsFromRaw(
            result.lyrics,
            { title, track, artist },
            durationSec,
            result.alternates ?? [],
          )
          if (applied && result.status === "instrumental") {
            setLyricsOutcome("instrumental")
            setStatus("error", "Song found — marked instrumental")
          }
          return
        }

        setLyricsAlternates([])

        setLyricsOutcome(result.status)
        setLyricsSearchPhase(result.message)
        setLyricsSearchStep("ready")

        if (result.status === "instrumental" || result.status === "partial") {
          setStatus(
            "error",
            result.status === "instrumental"
              ? "Song found — marked instrumental"
              : "Song found but no lyrics in database",
          )
          return
        }

        setStatus("error", result.message)
      } catch {
        setLyricsOutcome("network_error")
        setStatus("error", "Couldn't reach the lyrics service — check your connection")
      }
    },
    [
      videoId,
      resetLyricsSearch,
      setStatus,
      setMeta,
      setLyricsSearchPhase,
      setLyricsSearchStep,
      setNetworkRetryCount,
      addLyricsAttempt,
      setLrclibTrackId,
      setLyricsOutcome,
      applyParsedLyrics,
      applyLyricsFromRaw,
      setEnglishLines,
      setLanguageCode,
      setLyricsAlternates,
      setLyricsProvidersSearched,
    ],
  )

  const handleSelectAlternate = useCallback(
    (alternate: LyricsAlternate) => {
      const { title, artist, track } = usePlayerStore.getState()
      const currentSource = usePlayerStore.getState().lyricsSource
      const currentAlternates = usePlayerStore.getState().lyricsAlternates
      const currentResult = getLyricsCache(videoId)?.lyricsResult

      const nextAlternates = currentResult
        ? [
            {
              providerId: currentResult.providerId,
              id: currentResult.id,
              synced: usePlayerStore.getState().lyricsSynced,
              lineCount: usePlayerStore.getState().lyrics.length,
              rankScore: 0,
              lyricsResult: currentResult,
            },
            ...currentAlternates.filter(
              (a) => a.providerId !== alternate.providerId || a.id !== alternate.id,
            ),
          ]
        : currentAlternates.filter(
            (a) => a.providerId !== alternate.providerId || a.id !== alternate.id,
          )

      void applyLyricsFromRaw(
        alternate.lyricsResult,
        { title, track, artist },
        duration,
        nextAlternates,
      )
      if (typeof alternate.id === "number") setLrclibTrackId(alternate.id)
      else if (currentSource !== "lrclib") setLrclibTrackId(null)
    },
    [videoId, duration, applyLyricsFromRaw, setLrclibTrackId],
  )

  useEffect(() => {
    if (!ready || loadedRef.current || !videoId || duration <= 0) return
    loadedRef.current = true

    const load = async () => {
      const title = await getVideoTitle()
      const { artist, track } = parseTrackTitle(title)
      setMeta({ title, artist, track })
      await loadLyrics(artist, track, title, duration)
    }

    void load()
  }, [ready, videoId, duration, getVideoTitle, loadLyrics, setMeta])

  const handleRetry = useCallback(
    (artist: string, track: string, providerIds?: LyricsProviderId[]) => {
      const title = usePlayerStore.getState().title
      void loadLyrics(artist, track, title, duration, {
        skipPasted: true,
        skipCache: true,
        providerIds,
      })
    },
    [duration, loadLyrics],
  )

  const handlePaste = useCallback(
    (text: string) => {
      savePastedLyrics(videoId, text)
      const { title, artist, track } = usePlayerStore.getState()
      const parsed = applyLyricsText(text, duration)
      if (!parsed) {
        setStatus("error", "Could not parse pasted lyrics")
        return
      }
      void applyParsedLyrics(parsed, "pasted", { title, track, artist }, duration, text)
    },
    [videoId, duration, applyParsedLyrics, setStatus],
  )

  const handleTranslate = async () => {
    const result = await translateLinesWithFallback(
      lyrics.map((l) => l.text),
      { sourceLang: languageCode, videoId },
    )
    if (!result) return
    setEnglishLines(result.lines, "translated", result.backend)
    setDisplayMode("both")
    const cached = getLyricsCache(videoId)
    if (cached) {
      setLyricsCache({
        ...cached,
        englishLines: result.lines,
        englishSource: "translated",
        translationBackend: result.backend,
      })
    }
  }

  const handleYoutubeRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const showOpening = (fromHome || status === "idle") && !ready && lyrics.length === 0

  return (
    <AppShell>
      {showOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-muted-foreground">Opening player…</p>
        </div>
      )}
      <div className="flex h-[calc(100dvh-3.25rem)] min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            ← Home
          </Link>
          {debugPlayer && (
            <span
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400"
              role="status"
            >
              yt:{ready ? "ready" : "loading"} · {isPlaying ? "playing" : "paused"} ·{" "}
              {currentTime.toFixed(1)}/{duration.toFixed(1)}s · vid:
              {videoHidden ? "hidden" : "shown"}
              {playbackHint ? ` · ${playbackHint}` : ""}
            </span>
          )}
          {!isEnglish(languageCode) && englishLines.length === 0 && (available || translating) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleTranslate()}
              disabled={translating}
            >
              {translating ? "Translating…" : "Translate to English"}
            </Button>
          )}
          {englishLines.length > 0 && englishLines.length !== lyrics.length && (
            <span className="text-xs text-amber-500">Line count mismatch</span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className={cn(
              "flex shrink-0 flex-col lg:w-[42%] lg:min-h-0",
              videoHidden &&
                `pointer-events-none fixed top-0 overflow-hidden opacity-0 -left-[9999px] ${HIDDEN_EMBED_CLASS}`,
              !videoHidden && "px-4 py-2 lg:border-r lg:border-border lg:p-4",
            )}
            aria-hidden={videoHidden}
          >
            <div
              className={cn(
                !videoHidden && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-center",
              )}
            >
              <YouTubePanel
                containerRef={containerRef}
                hidden={videoHidden}
                layout="split"
              />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <NowPlayingHeader onSelectAlternate={handleSelectAlternate} />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {youtubeError ? (
                <PlayerError
                  title="Video couldn't load"
                  message={youtubeError.message || `YouTube error ${youtubeError.code}`}
                  onRetry={handleYoutubeRetry}
                />
              ) : (
                <LyricsStage
                  onRetry={handleRetry}
                  onPaste={handlePaste}
                  videoId={videoId}
                  videoReady={ready}
                />
              )}
            </div>
          </div>
        </div>

        <TransportControls
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          playbackHint={playbackHint}
          onPlay={play}
          onPause={pause}
          onSeek={seekTo}
        />
      </div>
    </AppShell>
  )
}
