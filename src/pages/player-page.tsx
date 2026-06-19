import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { MisroutedRouteView } from "@/components/misrouted-route-view"
import { LyricsMetadataConfirm } from "@/components/lyrics-metadata-confirm"
import { LyricsStage } from "@/components/lyrics-stage"
import { NowPlayingHeader } from "@/components/now-playing-header"
import { PlayerError } from "@/components/player-error"
import { TransportControls } from "@/components/transport-controls"
import { YouTubePanel } from "@/components/youtube-panel"
import { cn } from "@/lib/utils"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { useLyricsSync } from "@/hooks/use-lyrics-sync"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useTranslation } from "@/hooks/use-translation"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { resolveTrackMetadata } from "@/lib/track-metadata-resolver"
import { resolveEnglishLyrics } from "@/lib/english-lyrics-service"
import type { EnglishLyricsResult } from "@/lib/english-lyrics-service"
import {
  runLyricsPipeline,
  lyricsResultSampleText,
  lyricsResultToNativeLines,
} from "@/lib/lyrics-pipeline"
import { getLyricsCache, reparseCachedLyrics, setLyricsCache, type LyricsCacheEntry } from "@/lib/lyrics-cache"
import {
  bumpLyricsLoadGeneration,
  getActiveLyricsLoad,
  getLyricsLoadGeneration,
  isLyricsLoadStale,
  trackLyricsLoad,
} from "@/lib/lyrics-load-coordinator"
import { detectLanguage, inferPreferredLanguage, isEnglish, resolveTranslationSourceLang, type LyricsLanguageMeta } from "@/lib/language-service"
import { buildRomajiLines, type RomajiLyricsResult } from "@/lib/romaji-service"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import { translateLinesWithFallback } from "@/lib/translation-service"
import { getPastedLyrics, savePastedLyrics } from "@/lib/pasted-lyrics"
import { parseTrackTitle } from "@/lib/parse-track-title"
import {
  resolveCanonicalMusicVideo,
  shouldSkipCanonicalResolve,
} from "@/lib/canonical-music-video"
import { addRecentSong, enrichRecentSongEnglish } from "@/lib/recent-songs"
import {
  getPlaylistById,
  type PlaylistPlaybackContext,
} from "@/lib/playlists"
import { analyzeRoute, isValidPlayVideoId } from "@/lib/route-suggestions"
import type { PlayerNavigationState } from "@/lib/player-navigation"
import { fetchYouTubeAuthor } from "@/lib/youtube-oembed"
import { segmentsToLyricLines, transcriptToPlainLyrics } from "@/lib/transcript-to-lyrics"
import { TranscriptionError, transcribeFromYouTube } from "@/lib/transcription-service"
import { alignLinesToWords } from "@/lib/word-alignment"
import type { TranscriptSegment } from "@/lib/transcript-to-lyrics"
import { usePlayerStore, type LyricsSource } from "@/stores/player-store"
import type { LyricLine, LyricsAlternate, LyricsProviderId } from "@/types/lyrics"

function applyLyricsText(
  text: string,
  durationSec: number,
): { lines: LyricLine[]; synced: boolean; autoTimed?: boolean; suggestedOffsetMs?: number } | null {
  const trimmed = prepareLyricsText(text.trim())
  if (!trimmed) return null

  const durationMs = durationSec * 1000
  const fromLrc = parseLrc(trimmed, durationMs)
  if (fromLrc.lines.length > 0) return fromLrc

  const fromPlain = parsePlainLyrics(trimmed, durationMs)
  if (fromPlain.lines.length > 0) return fromPlain

  return null
}

function restoreCachedEnglish(
  cached: LyricsCacheEntry,
  setEnglishLines: ReturnType<typeof usePlayerStore.getState>["setEnglishLines"],
  setDisplayMode: ReturnType<typeof usePlayerStore.getState>["setDisplayMode"],
  setEnglishStatus: ReturnType<typeof usePlayerStore.getState>["setEnglishStatus"],
) {
  if (cached.englishStatus === "skipped") {
    setDisplayMode("native")
    setEnglishStatus("skipped")
    setEnglishLines([], null, null, "skipped")
    return
  }

  setEnglishLines(
    cached.englishLines,
    cached.englishSource ?? (cached.englishLines.length > 0 ? "found" : null),
    cached.translationBackend ?? null,
    cached.englishStatus ?? (cached.englishLines.length > 0 ? "ready" : null),
  )
}

/** Minimum embed size YouTube needs to start playback while visually hidden. */
const HIDDEN_EMBED_CLASS = "w-[320px] h-[180px]"

export function PlayerPage() {
  const { videoId = "" } = useParams()
  const location = useLocation()

  if (!isValidPlayVideoId(videoId)) {
    return <MisroutedRouteView issue={analyzeRoute(location.pathname, location.search)} />
  }

  return <PlayerPageContent videoId={videoId} />
}

function PlayerPageContent({ videoId }: { videoId: string }) {
  const [searchParams] = useSearchParams()
  const [pendingMetadata, setPendingMetadata] = useState<{
    title: string
    artist: string
    track: string
    options?: {
      skipPasted?: boolean
      skipCache?: boolean
      providerIds?: LyricsProviderId[]
      transcribeOnly?: boolean
    }
  } | null>(null)
  const debugPlayer = searchParams.get("debug") === "1"
  const location = useLocation()
  const navigate = useNavigate()
  const navigationState = location.state as PlayerNavigationState | null
  const fromHome = Boolean(navigationState?.fromHome)
  const seedMetadata = navigationState?.seedMetadata
  const onEndedRef = useRef<() => void>(() => {})
  const playlistAutoPlayPending = useRef(false)
  const loadedRef = useRef(false)
  const oembedAuthorRef = useRef<string | null>(null)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const alignAbortRef = useRef<AbortController | null>(null)
  const prevVideoIdRef = useRef<string | null>(null)
  const currentVideoIdRef = useRef(videoId)
  currentVideoIdRef.current = videoId
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
  } = useYouTubePlayer(videoId, { onEnded: () => onEndedRef.current() })

  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const status = usePlayerStore((s) => s.status)
  const setVideoId = usePlayerStore((s) => s.setVideoId)
  const setStatus = usePlayerStore((s) => s.setStatus)
  const setMeta = usePlayerStore((s) => s.setMeta)
  const setLyrics = usePlayerStore((s) => s.setLyrics)
  const setEnglishLines = usePlayerStore((s) => s.setEnglishLines)
  const setRomajiLines = usePlayerStore((s) => s.setRomajiLines)
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
  const setPlaylistContext = usePlayerStore((s) => s.setPlaylistContext)
  const bindPlaylistNavigation = usePlayerStore((s) => s.bindPlaylistNavigation)
  const languageCode = usePlayerStore((s) => s.languageCode)
  const englishLines = usePlayerStore((s) => s.englishLines)
  const englishStatus = usePlayerStore((s) => s.englishStatus)
  const lyrics = usePlayerStore((s) => s.lyrics)
  const resetSyncOffset = usePlayerStore((s) => s.resetSyncOffset)
  const setSyncOffset = usePlayerStore((s) => s.setSyncOffset)
  const setLyricsFollowMode = usePlayerStore((s) => s.setLyricsFollowMode)
  const setEnglishStatus = usePlayerStore((s) => s.setEnglishStatus)
  const setContentWarning = usePlayerStore((s) => s.setContentWarning)
  const setVerificationScore = usePlayerStore((s) => s.setVerificationScore)
  const focusMode = usePlayerStore((s) => s.focusMode)
  const resolvedMetadataRef = useRef<Awaited<ReturnType<typeof resolveTrackMetadata>> | null>(null)

  const navigateToPlaylistTrack = useCallback(
    (trackIndex: number) => {
      const ctx = usePlayerStore.getState().playlistContext
      if (!ctx) return
      const playlist = getPlaylistById(ctx.playlistId)
      if (!playlist) return
      const track = playlist.tracks[trackIndex]
      if (!track) return
      navigate(`/play/${track.videoId}`, {
        state: {
          playlistContext: {
            playlistId: ctx.playlistId,
            trackIndex,
          } satisfies PlaylistPlaybackContext,
          playlistAutoPlay: true,
        },
      })
    },
    [navigate],
  )

  const handleVideoEnded = useCallback(() => {
    const ctx = usePlayerStore.getState().playlistContext
    if (!ctx) return
    const playlist = getPlaylistById(ctx.playlistId)
    if (!playlist) return
    const nextIndex = ctx.trackIndex + 1
    if (nextIndex >= playlist.tracks.length) return
    navigateToPlaylistTrack(nextIndex)
  }, [navigateToPlaylistTrack])

  onEndedRef.current = handleVideoEnded

  useEffect(() => {
    const state = location.state as {
      playlistContext?: PlaylistPlaybackContext
      playlistAutoPlay?: boolean
    } | null
    setPlaylistContext(state?.playlistContext ?? null)
    playlistAutoPlayPending.current = Boolean(state?.playlistAutoPlay)
  }, [location.state, setPlaylistContext])

  useEffect(() => {
    if (!ready || !playlistAutoPlayPending.current) return
    playlistAutoPlayPending.current = false
    play()
  }, [ready, videoId, play])

  useEffect(() => {
    return () => setPlaylistContext(null)
  }, [setPlaylistContext])

  useEffect(() => {
    bindPlaylistNavigation(navigateToPlaylistTrack)
    return () => bindPlaylistNavigation(null)
  }, [bindPlaylistNavigation, navigateToPlaylistTrack])

  const ensureOEmbedAuthor = useCallback(async () => {
    if (oembedAuthorRef.current != null) return oembedAuthorRef.current
    const author = await fetchYouTubeAuthor(videoId)
    oembedAuthorRef.current = author
    return author
  }, [videoId])

  const { available, translating } = useTranslation(languageCode)

  const getTime = useCallback(() => currentTime, [currentTime])
  useLyricsSync(getTime)
  useKeyboardShortcuts()

  useEffect(() => {
    bindControls({ play, pause, seek: seekTo, isPlaying })
  }, [bindControls, play, pause, seekTo, isPlaying])

  useEffect(() => {
    if (!videoId) return

    const isNewVideo = prevVideoIdRef.current !== videoId
    prevVideoIdRef.current = videoId
    const activeLoad = getActiveLyricsLoad(videoId)
    const playerState = usePlayerStore.getState()
    const rejoinInFlight = Boolean(activeLoad)
    const alreadyReady =
      playerState.videoId === videoId &&
      playerState.status === "ready" &&
      playerState.lyrics.length > 0
    const alreadyLoading = playerState.videoId === videoId && playerState.status === "loading"
    const keepPlayerState =
      !isNewVideo &&
      (rejoinInFlight || alreadyReady || alreadyLoading || playerState.status === "error")

    if (isNewVideo && rejoinInFlight) {
      setVideoId(videoId)
      loadedRef.current = true
      void fetchYouTubeAuthor(videoId).then((author) => {
        oembedAuthorRef.current = author
      })
      return
    }

    if (keepPlayerState) {
      setVideoId(videoId)
      loadedRef.current = rejoinInFlight || alreadyReady || alreadyLoading
      if (oembedAuthorRef.current == null) {
        void fetchYouTubeAuthor(videoId).then((author) => {
          oembedAuthorRef.current = author
        })
      }
      return
    }

    resetSyncOffset()
    setLyricsFollowMode("follow")
    setVideoId(videoId)
    loadedRef.current = false
    oembedAuthorRef.current = null
    if (isNewVideo) {
      bumpLyricsLoadGeneration(videoId)
      transcribeAbortRef.current?.abort()
      alignAbortRef.current?.abort()
    }
    resetLyricsSearch()
    setStatus("idle")
    setLyrics([], true, null)
    setEnglishLines([])
    setRomajiLines([])
    setMeta({ title: "", artist: "", track: "" })
    setPendingMetadata(null)
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
        cached.aligned ?? cached.providerId === "transcription",
      )
      restoreCachedEnglish(cached, setEnglishLines, setDisplayMode, setEnglishStatus)
      setRomajiLines(cached.romajiLines ?? [], cached.romajiStatus ?? null)
      setLanguageCode(cached.languageCode)
      setLyricsAlternates(cached.alternates ?? [])
      setLrclibTrackId(
        typeof cached.lyricsResult.id === "number" ? cached.lyricsResult.id : null,
      )
      setLyricsOutcome("found")
      setStatus("ready")
      setLoadedFromCache(true)
      loadedRef.current = true
      // Duration-aware reparse happens in loadLyrics once YouTube duration is known.
      addRecentSong({
        videoId,
        title: cached.title,
        artist: cached.artist,
        track: cached.track,
      })
      void enrichRecentSongEnglish(videoId)
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
    setRomajiLines,
    setMeta,
    setLanguageCode,
    setDisplayMode,
    setEnglishStatus,
    setLrclibTrackId,
    setLyricsOutcome,
    resetLyricsSearch,
    setLoadedFromCache,
    setLyricsAlternates,
    resetSyncOffset,
    setLyricsFollowMode,
  ])

  const applyEnglishResult = useCallback(
    (english: EnglishLyricsResult | undefined, nativeLines: string[], sample: string) => {
      const languageMeta: LyricsLanguageMeta = {
        title: usePlayerStore.getState().title,
        artist: usePlayerStore.getState().artist,
        track: usePlayerStore.getState().track,
        oembedAuthor: oembedAuthorRef.current ?? undefined,
        preferredLanguage: inferPreferredLanguage({
          title: usePlayerStore.getState().title,
          artist: usePlayerStore.getState().artist,
          track: usePlayerStore.getState().track,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
        }),
      }
      const lang = detectLanguage(sample || nativeLines.join("\n"), languageMeta)
      setLanguageCode(lang)

      if (!english || english.status === "skipped") {
        setDisplayMode("native")
        setEnglishStatus("skipped")
        setEnglishLines([], null, null, "skipped")
        return
      }

      if (english.status === "ready" && english.lines.length > 0) {
        setEnglishLines(english.lines, english.source, english.translationBackend ?? null, "ready")
        setDisplayMode("both")
        return
      }

      setEnglishStatus(english.status)
      if (english.status === "failed") {
        setEnglishLines([], null, null, "failed")
      }
    },
    [setEnglishLines, setLanguageCode, setDisplayMode, setEnglishStatus],
  )

  const ensureEnglishLyrics = useCallback(
    async (
      track: string,
      artist: string,
      durationSec: number,
      nativeLines: string[],
      sample: string,
    ) => {
      setEnglishStatus("loading")
      const languageMeta: LyricsLanguageMeta = {
        title: usePlayerStore.getState().title,
        artist,
        track,
        oembedAuthor: oembedAuthorRef.current ?? undefined,
        preferredLanguage: inferPreferredLanguage({
          title: usePlayerStore.getState().title,
          artist,
          track,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
        }),
      }
      const sampleText = sample || nativeLines.join("\n")
      const english = await resolveEnglishLyrics({
        track,
        artist,
        nativeLines,
        language: detectLanguage(sampleText, languageMeta),
        durationSec,
        videoId,
        metadata: languageMeta,
        onProgress: (phase) => setLyricsSearchPhase(phase),
      })
      applyEnglishResult(english, nativeLines, sample)
      const cached = getLyricsCache(videoId)
      if (cached && (english.status === "ready" || english.status === "skipped")) {
        setLyricsCache({
          ...cached,
          englishLines: english.lines,
          englishSource: english.source,
          translationBackend: english.translationBackend ?? null,
          englishStatus: english.status,
        })
      }
      return english
    },
    [videoId, applyEnglishResult, setEnglishStatus, setLyricsSearchPhase],
  )

  const applyParsedLyrics = useCallback(
    async (
      parsed: { lines: LyricLine[]; synced: boolean; autoTimed?: boolean; aligned?: boolean },
      source: LyricsSource,
      meta: { title: string; track: string; artist: string },
      durationSec: number,
      sample: string,
      cachePayload?: Parameters<typeof setLyricsCache>[0],
      fromCache = false,
      preResolvedEnglish?: EnglishLyricsResult,
      pipelineHandlesEnglish = false,
      preResolvedRomaji?: RomajiLyricsResult,
      loadGeneration?: number,
    ) => {
      const uiStale =
        loadGeneration != null &&
        (isLyricsLoadStale(videoId, loadGeneration) ||
          usePlayerStore.getState().videoId !== videoId)

      if (uiStale) {
        if (cachePayload) setLyricsCache(cachePayload)
        return
      }

      setLyrics(
        parsed.lines,
        parsed.synced,
        source,
        parsed.autoTimed ?? false,
        parsed.aligned ?? false,
      )
      setLyricsOutcome("found")
      setLyricsSearchPhase(source === "pasted" ? "Using pasted lyrics" : "Ready")
      setLyricsSearchStep("ready")
      if (fromCache) setLoadedFromCache(true)
      const languageMeta: LyricsLanguageMeta = {
        title: meta.title,
        artist: meta.artist,
        track: meta.track,
        oembedAuthor: oembedAuthorRef.current ?? undefined,
        preferredLanguage: inferPreferredLanguage({
          title: meta.title,
          artist: meta.artist,
          track: meta.track,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
        }),
      }
      const language = detectLanguage(sample || parsed.lines.map((l) => l.text).join("\n"), languageMeta)
      const romaji =
        preResolvedRomaji ??
        (await buildRomajiLines(parsed.lines.map((line) => line.text), { language }))
      setRomajiLines(romaji.lines, romaji.status)
      addRecentSong({
        videoId,
        title: meta.title || meta.track,
        artist: meta.artist,
        track: meta.track,
      })
      void enrichRecentSongEnglish(videoId)
      setStatus("ready")
      if (cachePayload) {
        setLyricsCache({
          ...cachePayload,
          romajiLines: romaji.lines,
          romajiStatus: romaji.status,
        })
      }
      if (preResolvedEnglish) {
        applyEnglishResult(preResolvedEnglish, parsed.lines.map((l) => l.text), sample)
      } else if (!pipelineHandlesEnglish && !cachePayload?.englishLines?.length) {
        void ensureEnglishLyrics(
          meta.track,
          meta.artist,
          durationSec,
          parsed.lines.map((l) => l.text),
          sample,
        )
      }
    },
    [
      videoId,
      setLyrics,
      setLyricsOutcome,
      setLyricsSearchPhase,
      setLyricsSearchStep,
      setStatus,
      setLoadedFromCache,
      ensureEnglishLyrics,
      applyEnglishResult,
      setRomajiLines,
    ],
  )

  const tryTranscribeLyrics = useCallback(
    async (
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      loadGeneration: number,
      signal?: AbortSignal,
    ): Promise<boolean> => {
      setLyricsSearchPhase("Transcribing from audio…")
      setLyricsSearchStep("search")

      try {
        const transcript = await transcribeFromYouTube({
          videoId,
          artist,
          track,
          language: inferPreferredLanguage({
            title,
            artist,
            track,
            oembedAuthor: oembedAuthorRef.current ?? undefined,
          }),
          durationSec: Math.round(durationSec) || undefined,
          signal,
        })

        if (signal?.aborted || isLyricsLoadStale(videoId, loadGeneration)) return false

        const state = usePlayerStore.getState()
        if (state.videoId !== videoId || isLyricsLoadStale(videoId, loadGeneration)) return false

        const durationMs = durationSec * 1000
        const parsed = segmentsToLyricLines(transcript.segments, durationMs)
        if (parsed.lines.length === 0 && transcript.text.trim()) {
          const fallbackSegments: TranscriptSegment[] = [
            { start: 0, end: durationSec, text: transcript.text.trim() },
          ]
          Object.assign(parsed, segmentsToLyricLines(fallbackSegments, durationMs))
        }

        if (parsed.lines.length === 0) {
          setLyricsOutcome("not_found")
          setStatus("error", "Transcription returned no lyric lines")
          return false
        }

        const plainLyrics = transcriptToPlainLyrics(transcript.segments) || transcript.text
        const languageMeta: LyricsLanguageMeta = {
          title,
          artist,
          track,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
          preferredLanguage: inferPreferredLanguage({
            title,
            artist,
            track,
            oembedAuthor: oembedAuthorRef.current ?? undefined,
          }),
        }
        const lang = detectLanguage(plainLyrics, languageMeta)
        const lyricsResult = {
          id: `transcription:${videoId}`,
          providerId: "transcription" as const,
          plainLyrics,
          syncedLyrics: null,
        }

        addLyricsAttempt("transcription:auto")

        await applyParsedLyrics(
          parsed,
          "transcription",
          { title, track, artist },
          durationSec,
          plainLyrics,
          {
            videoId,
            lyricsResult,
            providerId: "transcription",
            lines: parsed.lines,
            synced: true,
            autoTimed: false,
            aligned: true,
            alternates: [],
            englishLines: [],
            languageCode: transcript.language ?? lang,
            title,
            artist,
            track,
            parsedDurationMs: durationMs,
          },
          false,
          undefined,
          false,
          undefined,
          loadGeneration,
        )

        if (transcript.partial) {
          setLyricsSearchPhase("Transcribed partial audio — timing may drift on long tracks")
        }

        return true
      } catch (err) {
        if (signal?.aborted || isLyricsLoadStale(videoId, loadGeneration)) return false
        const state = usePlayerStore.getState()
        if (state.videoId !== videoId) return false
        if (err instanceof TranscriptionError) {
          const isTransient = err.status === 429 || (err.status >= 502 && err.status <= 504)
          setLyricsOutcome(isTransient ? "network_error" : "not_found")
          setStatus("error", err.message)
          return false
        }
        setLyricsOutcome("network_error")
        setStatus("error", "Couldn't transcribe audio — check your connection")
        return false
      }
    },
    [
      videoId,
      setLyricsSearchPhase,
      setLyricsSearchStep,
      addLyricsAttempt,
      applyParsedLyrics,
      setLyricsOutcome,
      setStatus,
    ],
  )

  const tryAlignPlainLyrics = useCallback(
    async (
      lines: LyricLine[],
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      loadGeneration: number,
      signal?: AbortSignal,
    ) => {
      try {
        const transcript = await transcribeFromYouTube({
          videoId,
          artist,
          track,
          language: inferPreferredLanguage({
            title,
            artist,
            track,
            oembedAuthor: oembedAuthorRef.current ?? undefined,
          }),
          durationSec: Math.round(durationSec) || undefined,
          signal,
        })

        if (signal?.aborted || transcript.segments.length === 0) return
        if (isLyricsLoadStale(videoId, loadGeneration)) return

        const words = transcript.segments.flatMap((seg) => {
          const tokens = seg.text.split(/\s+/).filter(Boolean)
          if (tokens.length === 0) return []
          const startMs = Math.round(seg.start * 1000)
          const endMs = Math.round(Math.max(seg.end, seg.start + 0.05) * 1000)
          const step = Math.max((endMs - startMs) / tokens.length, 80)
          return tokens.map((text, i) => ({
            text,
            startMs: Math.round(startMs + i * step),
            endMs: Math.round(startMs + (i + 1) * step),
          }))
        })

        const aligned = alignLinesToWords(lines, words)
        const hasWordTiming = aligned.some((line) => line.words && line.words.length > 0)
        if (!hasWordTiming) return

        const state = usePlayerStore.getState()
        if (state.videoId !== videoId || isLyricsLoadStale(videoId, loadGeneration)) return

        setLyrics(aligned, true, state.lyricsSource ?? "lrclib", false, true)

        const cached = getLyricsCache(videoId)
        if (cached) {
          setLyricsCache({ ...cached, lines: aligned, synced: true, aligned: true })
        }
      } catch {
        // Background alignment is best-effort
      }
    },
    [videoId, setLyrics],
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
      preResolvedEnglish?: EnglishLyricsResult,
      pipelineHandlesEnglish = false,
      loadGeneration?: number,
    ) => {
      const syncedRaw = lyricsResult.syncedLyrics?.trim()
        ? prepareLyricsText(lyricsResult.syncedLyrics)
        : null
      const plainRaw = lyricsResult.plainLyrics?.trim()
        ? prepareLyricsText(lyricsResult.plainLyrics)
        : null

      let parsed =
        syncedRaw
          ? parseLrc(syncedRaw, durationSec * 1000)
          : plainRaw
            ? parsePlainLyrics(plainRaw, durationSec * 1000)
            : { lines: [], synced: false, autoTimed: false }

      if (parsed.lines.length === 0 && plainRaw) {
        parsed = parsePlainLyrics(plainRaw, durationSec * 1000)
      }

      if (parsed.lines.length === 0) {
        setLyricsOutcome("partial")
        setStatus("error", "Lyrics were found but contain no lines to display")
        return false
      }

      if (parsed.suggestedOffsetMs) {
        setSyncOffset(parsed.suggestedOffsetMs)
      }

      const sample = plainRaw ?? syncedRaw ?? parsed.lines.map((l) => l.text).join("\n")
      const languageMeta: LyricsLanguageMeta = {
        title: meta.title,
        artist: meta.artist,
        track: meta.track,
        oembedAuthor: oembedAuthorRef.current ?? undefined,
        preferredLanguage: inferPreferredLanguage({
          title: meta.title,
          artist: meta.artist,
          track: meta.track,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
        }),
      }
      const lang = detectLanguage(sample, languageMeta)
      const uiStale =
        loadGeneration != null &&
        (isLyricsLoadStale(videoId, loadGeneration) ||
          usePlayerStore.getState().videoId !== videoId)
      if (!uiStale) {
        setLyricsAlternates(alternates)
      }

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
          aligned: parsed.aligned ?? false,
          alternates,
          englishLines: preResolvedEnglish?.lines ?? [],
          englishSource: preResolvedEnglish?.source ?? null,
          translationBackend: preResolvedEnglish?.translationBackend ?? null,
          englishStatus: preResolvedEnglish?.status ?? null,
          languageCode: lang,
          title: meta.title,
          artist: meta.artist,
          track: meta.track,
          parsedDurationMs: durationSec * 1000,
        },
        false,
        preResolvedEnglish,
        pipelineHandlesEnglish,
        undefined,
        loadGeneration,
      )

      if (!parsed.synced && parsed.lines.length > 0 && !uiStale) {
        alignAbortRef.current?.abort()
        const controller = new AbortController()
        alignAbortRef.current = controller
        void tryAlignPlainLyrics(
          parsed.lines,
          meta.artist,
          meta.track,
          meta.title,
          durationSec,
          loadGeneration ?? getLyricsLoadGeneration(videoId),
          controller.signal,
        )
      }

      return true
    },
    [videoId, applyParsedLyrics, setLyricsAlternates, setLyricsOutcome, setStatus, setSyncOffset, tryAlignPlainLyrics],
  )

  const loadLyrics = useCallback(
    async (
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      options?: {
        skipPasted?: boolean
        skipCache?: boolean
        providerIds?: LyricsProviderId[]
        transcribeOnly?: boolean
      },
    ) => {
      const loadVideoId = videoId
      const generation = getLyricsLoadGeneration(loadVideoId)
      let resolveDone!: () => void
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve
      })
      trackLyricsLoad(loadVideoId, generation, done)

      const isUiStale = () =>
        isLyricsLoadStale(loadVideoId, generation) ||
        usePlayerStore.getState().videoId !== loadVideoId

      try {
        resetLyricsSearch()
        setEnglishLines([])
        setStatus("loading")
        setLyricsSearchPhase("Parsing title…")
        setLyricsSearchStep("parse")
        setMeta({ title, artist, track })

        if (options?.transcribeOnly) {
          transcribeAbortRef.current?.abort()
          const controller = new AbortController()
          transcribeAbortRef.current = controller
          await tryTranscribeLyrics(
            artist,
            track,
            title,
            durationSec,
            generation,
            controller.signal,
          )
          return
        }

        if (!options?.skipPasted) {
          const pasted = getPastedLyrics(videoId)
          if (pasted) {
            const parsed = applyLyricsText(pasted, durationSec)
            if (parsed) {
              if (isUiStale()) return
              if (parsed.suggestedOffsetMs) setSyncOffset(parsed.suggestedOffsetMs)
              else resetSyncOffset()
              await applyParsedLyrics(
                parsed,
                "pasted",
                { title, track, artist },
                durationSec,
                pasted,
                undefined,
                false,
                undefined,
                false,
                undefined,
                generation,
              )
              return
            }
          }
        }

        if (!options?.skipCache) {
          const cached = getLyricsCache(videoId)
          if (cached) {
            if (isUiStale()) return
            const durationMs = durationSec * 1000
            const reparsed = reparseCachedLyrics(cached, durationMs)
            const parsed = reparsed ?? {
              lines: cached.lines,
              synced: cached.synced,
              autoTimed: cached.autoTimed ?? !cached.synced,
            }

            setMeta({
              title: cached.title || title,
              artist: cached.artist || artist,
              track: cached.track || track,
            })
            restoreCachedEnglish(cached, setEnglishLines, setDisplayMode, setEnglishStatus)
            setLanguageCode(cached.languageCode)
            setLyricsAlternates(cached.alternates ?? [])
            if (parsed.suggestedOffsetMs) setSyncOffset(parsed.suggestedOffsetMs)
            await applyParsedLyrics(
              {
                lines: parsed.lines,
                synced: parsed.synced,
                autoTimed: parsed.autoTimed,
                aligned: cached.aligned ?? false,
              },
              cached.providerId ?? cached.lyricsResult.providerId,
              {
                title: cached.title || title,
                track: cached.track || track,
                artist: cached.artist || artist,
              },
              durationSec,
              cached.lyricsResult.plainLyrics ?? cached.lines.map((l) => l.text).join("\n"),
              {
                videoId,
                lyricsResult: cached.lyricsResult,
                providerId: cached.providerId ?? cached.lyricsResult.providerId,
                lines: parsed.lines,
                synced: parsed.synced,
                autoTimed: parsed.autoTimed,
                aligned: cached.aligned ?? false,
                alternates: cached.alternates ?? [],
                englishLines: cached.englishLines,
                englishSource: cached.englishSource ?? null,
                translationBackend: cached.translationBackend ?? null,
                englishStatus: cached.englishStatus ?? null,
                languageCode: cached.languageCode,
                title: cached.title || title,
                artist: cached.artist || artist,
                track: cached.track || track,
                parsedDurationMs: durationMs,
              },
              true,
              undefined,
              false,
              undefined,
              generation,
            )
            return
          }
        }

        let pipelineEnglishSample = ""
        const pipeline = await runLyricsPipeline({
          track,
          artist,
          title,
          durationSec: Math.round(durationSec) || 0,
          videoId,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
          resolvedMetadata: resolvedMetadataRef.current ?? undefined,
          skipCache: options?.skipCache,
          preferredLanguage: inferPreferredLanguage({
            title,
            artist,
            track,
            oembedAuthor: oembedAuthorRef.current ?? undefined,
          }),
          providerIds: options?.providerIds,
          onProgress: ({ phase, step, retryRound, providersTried }) => {
            if (isUiStale()) return
            setLyricsSearchPhase(phase)
            setLyricsSearchStep(step)
            if (providersTried) setLyricsProvidersSearched(providersTried)
            if (retryRound) setNetworkRetryCount(retryRound)
          },
          onEnglishProgress: (phase) => {
            if (isUiStale()) return
            setLyricsSearchPhase(phase)
          },
          onNativeReady: (nativeResult) => {
            if (isUiStale()) return
            if (!nativeResult.lyrics) return
            pipelineEnglishSample = lyricsResultSampleText(nativeResult.lyrics)
            void applyLyricsFromRaw(
              nativeResult.lyrics,
              { title, track, artist },
              durationSec,
              nativeResult.alternates ?? [],
              undefined,
              true,
              generation,
            )
          },
        })

        const result = pipeline.native
        const english = pipeline.english

        if (import.meta.env.DEV) {
          console.info("[lyrics-pipeline]", {
            videoId,
            timings: pipeline.timings,
            englishStatus: english.status,
          })
        }

        if (isUiStale()) return

        setLyricsProvidersSearched(result.providersTried)
        setContentWarning(result.contentAssessment?.message ?? null)
        setVerificationScore(result.verificationScore ?? null)

        for (const attempt of result.attempts) {
          if (attempt.result !== "skipped") {
            addLyricsAttempt(attempt.provider ? `${attempt.provider}:${attempt.strategy}` : attempt.strategy)
          }
        }

        if (typeof result.matchId === "number") setLrclibTrackId(result.matchId)
        else setLrclibTrackId(null)

        if ((result.status === "found" || result.status === "instrumental") && result.lyrics) {
          if (isUiStale()) return
          const sample =
            pipelineEnglishSample || lyricsResultSampleText(result.lyrics)
          const nativeLines = lyricsResultToNativeLines(result.lyrics)
          applyEnglishResult(english, nativeLines, sample)

          const cached = getLyricsCache(videoId)
          if (cached && (english.status === "ready" || english.status === "skipped")) {
            setLyricsCache({
              ...cached,
              englishLines: english.lines,
              englishSource: english.source,
              translationBackend: english.translationBackend ?? null,
              englishStatus: english.status,
            })
          }

          if (isUiStale()) return
          if (result.status === "instrumental") {
            setLyricsOutcome("instrumental")
            setStatus("error", "Song found — marked instrumental")
          }
          return
        }

        setLyricsAlternates([])

        if (result.status === "not_found" || result.status === "partial") {
          transcribeAbortRef.current?.abort()
          const controller = new AbortController()
          transcribeAbortRef.current = controller
          const transcribed = await tryTranscribeLyrics(
            artist,
            track,
            title,
            durationSec,
            generation,
            controller.signal,
          )
          if (isUiStale()) return
          if (transcribed) return
        }

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
        if (isUiStale()) return
        setLyricsOutcome("network_error")
        setStatus("error", "Couldn't reach the lyrics service — check your connection")
      } finally {
        resolveDone()
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
      setSyncOffset,
      resetSyncOffset,
      tryTranscribeLyrics,
      setContentWarning,
      setVerificationScore,
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

    const activeLoad = getActiveLyricsLoad(videoId)
    if (activeLoad) {
      loadedRef.current = true
      return
    }

    const playerState = usePlayerStore.getState()
    if (
      playerState.videoId === videoId &&
      (playerState.status === "ready" || playerState.status === "loading") &&
      (playerState.lyrics.length > 0 || playerState.status === "loading")
    ) {
      loadedRef.current = true
      return
    }

    loadedRef.current = true

    const load = async () => {
      const loadVideoId = videoId
      const loadGeneration = getLyricsLoadGeneration(loadVideoId)
      const isRouteStale = () =>
        currentVideoIdRef.current !== loadVideoId ||
        isLyricsLoadStale(loadVideoId, loadGeneration) ||
        usePlayerStore.getState().videoId !== loadVideoId

      const [title, oembedAuthor] = await Promise.all([getVideoTitle(), ensureOEmbedAuthor()])
      if (isRouteStale()) return

      let activeSeedMetadata = seedMetadata

      if (!shouldSkipCanonicalResolve(videoId, navigationState?.canonicalChecked)) {
        setLyricsSearchPhase("Finding YouTube Music original…")
        setLyricsSearchStep("search")
        const canonical = await resolveCanonicalMusicVideo({
          kind: "youtube",
          videoId,
          title,
          durationSec: duration,
          oembedAuthor,
        })
        if (isRouteStale()) return

        if (canonical.ok) {
          activeSeedMetadata = canonical.seedMetadata
          if (canonical.videoId !== videoId) {
            navigate(`/play/${canonical.videoId}`, {
              replace: true,
              state: {
                ...((location.state as object | null) ?? {}),
                seedMetadata: canonical.seedMetadata,
                canonicalChecked: canonical.videoId,
                canonicalSourceVideoId: videoId,
              },
            })
            return
          }
        }
      }

      const rough = parseTrackTitle(title, oembedAuthor ?? undefined)
      setLyricsSearchPhase("Resolving song…")
      setLyricsSearchStep("parse")

      const resolved = await resolveTrackMetadata({
        title,
        durationSec: duration,
        oembedAuthor: oembedAuthor ?? undefined,
        roughArtist: activeSeedMetadata?.artist ?? rough.artist,
        roughTrack: activeSeedMetadata?.track ?? rough.track,
      })
      if (isRouteStale()) return

      resolvedMetadataRef.current = resolved
      setMeta({ title, artist: resolved.artist, track: resolved.track })
      const hasExistingLyrics = usePlayerStore.getState().lyrics.length > 0
      const hasPastedLyrics = Boolean(getPastedLyrics(videoId))
      if (!hasExistingLyrics && !hasPastedLyrics) {
        resetLyricsSearch()
        setPendingMetadata({ title, artist: resolved.artist, track: resolved.track })
        return
      }
      await loadLyrics(resolved.artist, resolved.track, title, duration)
    }

    void load()
  }, [
    ready,
    videoId,
    duration,
    getVideoTitle,
    loadLyrics,
    setMeta,
    ensureOEmbedAuthor,
    seedMetadata,
    navigationState,
    navigate,
    location.state,
    resetLyricsSearch,
  ])

  const handleRetry = useCallback(
    (artist: string, track: string, providerIds?: LyricsProviderId[]) => {
      const title = usePlayerStore.getState().title
      bumpLyricsLoadGeneration(videoId)
      void loadLyrics(artist, track, title, duration, {
        skipPasted: true,
        skipCache: true,
        providerIds,
      })
    },
    [videoId, duration, loadLyrics],
  )

  const handleConfirmMetadata = useCallback(
    (artist: string, track: string) => {
      if (!pendingMetadata) return
      const { title, options } = pendingMetadata
      setPendingMetadata(null)
      bumpLyricsLoadGeneration(videoId)
      resolvedMetadataRef.current = {
        ...(resolvedMetadataRef.current ?? {
          source: "parse" as const,
          confidence: 0,
          alternates: [],
        }),
        artist,
        track,
      }
      setMeta({ title, artist, track })
      void loadLyrics(artist, track, title, duration, options)
    },
    [duration, loadLyrics, pendingMetadata, videoId],
  )

  const handleRefreshLyrics = useCallback(async () => {
    if (duration <= 0 || usePlayerStore.getState().status === "loading") return

    bumpLyricsLoadGeneration(videoId)
    transcribeAbortRef.current?.abort()
    alignAbortRef.current?.abort()
    setLoadedFromCache(false)
    setContentWarning(null)
    setVerificationScore(null)

    const title = await getVideoTitle()
    setLyricsSearchPhase("Resolving song…")
    setLyricsSearchStep("parse")

    const oembedAuthor = await ensureOEmbedAuthor()
    const rough = parseTrackTitle(title, oembedAuthor ?? undefined)
    const resolved = await resolveTrackMetadata({
      title,
      durationSec: duration,
      oembedAuthor: oembedAuthor ?? undefined,
      roughArtist: seedMetadata?.artist ?? rough.artist,
      roughTrack: seedMetadata?.track ?? rough.track,
    })
    resolvedMetadataRef.current = resolved
    setMeta({ title, artist: resolved.artist, track: resolved.track })
    resetLyricsSearch()
    setPendingMetadata({
      title,
      artist: resolved.artist,
      track: resolved.track,
      options: {
        skipPasted: true,
        skipCache: true,
      },
    })
  }, [
    duration,
    getVideoTitle,
    setMeta,
    setLyricsSearchPhase,
    setLyricsSearchStep,
    setLoadedFromCache,
    setContentWarning,
    setVerificationScore,
    ensureOEmbedAuthor,
    resetLyricsSearch,
    seedMetadata,
    videoId,
  ])

  const handleTranscribe = useCallback(() => {
    const { title, artist, track } = usePlayerStore.getState()
    bumpLyricsLoadGeneration(videoId)
    void loadLyrics(artist, track, title, duration, {
      skipPasted: true,
      skipCache: true,
      transcribeOnly: true,
    })
  }, [videoId, duration, loadLyrics])

  const handlePaste = useCallback(
    (text: string) => {
      savePastedLyrics(videoId, text)
      const { title, artist, track } = usePlayerStore.getState()
      const parsed = applyLyricsText(text, duration)
      if (!parsed) {
        setStatus("error", "Could not parse pasted lyrics")
        return
      }
      if (parsed.suggestedOffsetMs) setSyncOffset(parsed.suggestedOffsetMs)
      else resetSyncOffset()
      void applyParsedLyrics(parsed, "pasted", { title, track, artist }, duration, text)
    },
    [videoId, duration, applyParsedLyrics, setStatus, setSyncOffset, resetSyncOffset],
  )

  const handleTranslate = async () => {
    const { title, artist, track } = usePlayerStore.getState()
    const languageMeta: LyricsLanguageMeta = {
      title,
      artist,
      track,
      oembedAuthor: oembedAuthorRef.current ?? undefined,
      preferredLanguage: inferPreferredLanguage({
        title,
        artist,
        track,
        oembedAuthor: oembedAuthorRef.current ?? undefined,
      }),
    }
    const nativeText = lyrics.map((l) => l.text).join("\n")
    const result = await translateLinesWithFallback(
      lyrics.map((l) => l.text),
      {
        sourceLang: resolveTranslationSourceLang(nativeText, languageMeta),
        videoId,
        mandatory: true,
      },
    )
    if (!result) return
    setEnglishLines(result.lines, "translated", result.backend, "ready")
    setDisplayMode("both")
    const cached = getLyricsCache(videoId)
    if (cached) {
      setLyricsCache({
        ...cached,
        englishLines: result.lines,
        englishSource: "translated",
        translationBackend: result.backend,
        englishStatus: "ready",
      })
    }
  }

  const handleYoutubeRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const showOpening = (fromHome || status === "idle") && !ready && lyrics.length === 0

  return (
    <AppShell viewportLock>
      {showOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-muted-foreground">Opening player…</p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {focusMode && (
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
              </span>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div
            className={cn(
              "flex shrink-0 flex-col lg:w-[42%] lg:min-h-0 lg:max-h-full lg:shrink lg:overflow-hidden",
              videoHidden &&
                `pointer-events-none fixed top-0 overflow-hidden opacity-0 -left-[9999px] ${HIDDEN_EMBED_CLASS}`,
              !videoHidden && "px-4 py-2 lg:border-r lg:border-border lg:p-4",
            )}
            aria-hidden={videoHidden}
          >
            <div
              className={cn(
                !videoHidden &&
                  "lg:flex lg:h-full lg:min-h-0 lg:max-h-full lg:flex-col lg:items-center lg:justify-center",
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
            {!focusMode && (
              <NowPlayingHeader
                onSelectAlternate={handleSelectAlternate}
                onTranslate={() => void handleTranslate()}
                onRefreshLyrics={() => void handleRefreshLyrics()}
                translating={translating}
                showTranslate={
                  !isEnglish(languageCode) &&
                  englishLines.length === 0 &&
                  lyrics.length > 0 &&
                  (available || translating || englishStatus === "failed")
                }
              />
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:py-4">
              {youtubeError ? (
                <PlayerError
                  title="Video couldn't load"
                  message={youtubeError.message || `YouTube error ${youtubeError.code}`}
                  onRetry={handleYoutubeRetry}
                />
              ) : pendingMetadata ? (
                <LyricsMetadataConfirm
                  artist={pendingMetadata.artist}
                  track={pendingMetadata.track}
                  onConfirm={handleConfirmMetadata}
                />
              ) : (
                <LyricsStage
                  onRetry={handleRetry}
                  onPaste={handlePaste}
                  onTranscribe={handleTranscribe}
                  videoId={videoId}
                  videoReady={ready}
                  durationMs={duration * 1000}
                />
              )}
            </div>
          </div>
        </div>

        <TransportControls
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onPlay={play}
          onPause={pause}
          onSeek={seekTo}
          onRefreshLyrics={() => void handleRefreshLyrics()}
        />
      </div>
    </AppShell>
  )
}
