import { useCallback, useEffect, useRef } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { LyricsStage } from "@/components/lyrics-stage"
import { NowPlayingHeader } from "@/components/now-playing-header"
import { PlayerError } from "@/components/player-error"
import { TransportControls } from "@/components/transport-controls"
import { YouTubePanel } from "@/components/youtube-panel"
import { Button } from "@/components/ui/button"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { useLyricsSync } from "@/hooks/use-lyrics-sync"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useTranslation } from "@/hooks/use-translation"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { getLyricsCache, setLyricsCache } from "@/lib/lyrics-cache"
import { searchEnglishLyrics } from "@/lib/lyrics-service"
import { detectLanguage, isEnglish } from "@/lib/language-service"
import { getPastedLyrics, savePastedLyrics } from "@/lib/pasted-lyrics"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { addRecentSong } from "@/lib/recent-songs"
import { fetchYouTubeAuthor } from "@/lib/youtube-oembed"
import { usePlayerStore } from "@/stores/player-store"
import type { LyricLine } from "@/types/lyrics"

function applyLyricsText(
  text: string,
  durationSec: number,
): { lines: LyricLine[]; synced: boolean } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const durationMs = durationSec * 1000
  const fromLrc = parseLrc(trimmed, durationMs)
  if (fromLrc.lines.length > 0) return fromLrc

  const fromPlain = parsePlainLyrics(trimmed, durationMs)
  if (fromPlain.lines.length > 0) return fromPlain

  return null
}

export function PlayerPage() {
  const { videoId = "" } = useParams()
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
  const setLyricsOutcome = usePlayerStore((s) => s.setLyricsOutcome)
  const setLrclibTrackId = usePlayerStore((s) => s.setLrclibTrackId)
  const setLoadedFromCache = usePlayerStore((s) => s.setLoadedFromCache)
  const resetLyricsSearch = usePlayerStore((s) => s.resetLyricsSearch)
  const setLyricsSearchPhase = usePlayerStore((s) => s.setLyricsSearchPhase)
  const setLyricsSearchStep = usePlayerStore((s) => s.setLyricsSearchStep)
  const addLyricsAttempt = usePlayerStore((s) => s.addLyricsAttempt)
  const setNetworkRetryCount = usePlayerStore((s) => s.setNetworkRetryCount)
  const bindControls = usePlayerStore((s) => s.bindControls)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const lyrics = usePlayerStore((s) => s.lyrics)

  const { available, translating, translateLines } = useTranslation(languageCode)

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
      setLyrics(cached.lines, cached.synced, "lrclib")
      setEnglishLines(cached.englishLines)
      setLanguageCode(cached.languageCode)
      setLrclibTrackId(cached.lyricsResult.id)
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
  ])

  const loadEnglishTranslation = useCallback(
    async (track: string, artist: string, durationSec: number, sample: string) => {
      const lang = detectLanguage(sample)
      setLanguageCode(lang)
      if (isEnglish(lang)) return

      const enResult = await searchEnglishLyrics(track, artist, Math.round(durationSec))
      if (enResult?.plainLyrics) {
        setEnglishLines(enResult.plainLyrics.split("\n").filter(Boolean))
      }
    },
    [setEnglishLines, setLanguageCode],
  )

  const applyParsedLyrics = useCallback(
    async (
      parsed: { lines: LyricLine[]; synced: boolean },
      source: "lrclib" | "pasted",
      meta: { title: string; track: string; artist: string },
      durationSec: number,
      sample: string,
      cachePayload?: Parameters<typeof setLyricsCache>[0],
      fromCache = false,
    ) => {
      setLyrics(parsed.lines, parsed.synced, source)
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
      void loadEnglishTranslation(meta.track, meta.artist, durationSec, sample)
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

  const loadLyrics = useCallback(
    async (
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      options?: { skipPasted?: boolean; skipCache?: boolean },
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
          await applyParsedLyrics(
            { lines: cached.lines, synced: cached.synced },
            "lrclib",
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
          onProgress: ({ phase, step, retryRound }) => {
            setLyricsSearchPhase(phase)
            setLyricsSearchStep(step)
            if (retryRound) setNetworkRetryCount(retryRound)
          },
        })

        for (const attempt of result.attempts) {
          if (attempt.result !== "skipped") addLyricsAttempt(attempt.strategy)
        }

        if (result.matchId) setLrclibTrackId(result.matchId)

        if (result.status === "found" && result.lyrics) {
          let parsed =
            result.lyrics.syncedLyrics?.trim()
              ? parseLrc(result.lyrics.syncedLyrics, durationSec * 1000)
              : result.lyrics.plainLyrics
                ? parsePlainLyrics(result.lyrics.plainLyrics, durationSec * 1000)
                : { lines: [], synced: false }

          if (parsed.lines.length === 0 && result.lyrics.plainLyrics) {
            parsed = parsePlainLyrics(result.lyrics.plainLyrics, durationSec * 1000)
          }

          if (parsed.lines.length === 0) {
            setLyricsOutcome("partial")
            setStatus("error", "Lyrics were found but contain no lines to display")
            return
          }

          const sample =
            result.lyrics.plainLyrics ?? parsed.lines.map((l) => l.text).join("\n")
          const lang = detectLanguage(sample)

          await applyParsedLyrics(
            parsed,
            "lrclib",
            { title, track, artist },
            durationSec,
            sample,
            {
              videoId,
              lyricsResult: result.lyrics,
              lines: parsed.lines,
              synced: parsed.synced,
              englishLines: [],
              languageCode: lang,
              title,
              artist,
              track,
            },
          )
          return
        }

        setLyricsOutcome(result.status)
        setLyricsSearchPhase(result.message)
        setLyricsSearchStep("ready")

        if (result.status === "instrumental" || result.status === "partial") {
          setStatus(
            "error",
            result.status === "instrumental"
              ? "Song found — marked instrumental in LRCLIB"
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
      setEnglishLines,
      setLanguageCode,
    ],
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
    (artist: string, track: string) => {
      const title = usePlayerStore.getState().title
      void loadLyrics(artist, track, title, duration, { skipPasted: true, skipCache: true })
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
    const translated = await translateLines(lyrics.map((l) => l.text))
    setEnglishLines(translated)
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
      <div className="flex flex-1 flex-col lg:flex-row">
        <div
          className={`flex flex-col ${videoHidden ? "lg:w-0" : "lg:w-1/2"} w-full border-b border-border lg:border-b-0 lg:border-r`}
        >
          <YouTubePanel containerRef={containerRef} hidden={videoHidden} />
        </div>
        <div className={`flex flex-1 flex-col ${videoHidden ? "w-full" : "lg:w-1/2"}`}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              ← Home
            </Link>
            {!isEnglish(languageCode) && englishLines.length === 0 && available && (
              <Button
                variant="outline"
                size="sm"
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
          <NowPlayingHeader />
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
          <TransportControls
            duration={duration}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={play}
            onPause={pause}
            onSeek={seekTo}
          />
        </div>
      </div>
    </AppShell>
  )
}
