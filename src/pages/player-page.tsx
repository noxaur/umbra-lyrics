import { useCallback, useEffect, useRef } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { MisroutedRouteView } from "@/components/misrouted-route-view"
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
import { orchestrateLyricsSearch } from "@/lib/lyrics-orchestrator"
import { getLyricsCache, reparseCachedLyrics, setLyricsCache } from "@/lib/lyrics-cache"
import { detectLanguage, inferPreferredLanguage, isEnglish } from "@/lib/language-service"
import { prepareLyricsText } from "@/lib/prepare-lyrics-text"
import { translateLinesWithFallback } from "@/lib/translation-service"
import { getPastedLyrics, savePastedLyrics } from "@/lib/pasted-lyrics"
import { syncMkvExportFromUrl } from "@/lib/beta-features"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { addRecentSong, enrichRecentSongEnglish } from "@/lib/recent-songs"
import { analyzeRoute, isValidPlayVideoId } from "@/lib/route-suggestions"
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
  const debugPlayer = searchParams.get("debug") === "1"
  const location = useLocation()
  const fromHome = Boolean(
    (location.state as { fromHome?: boolean } | null)?.fromHome,
  )
  const loadedRef = useRef(false)
  const oembedAuthorRef = useRef<string | null>(null)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const alignAbortRef = useRef<AbortController | null>(null)
  const alignRequestRef = useRef(0)
  const transcribeRequestRef = useRef(0)
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
  const resetSyncOffset = usePlayerStore((s) => s.resetSyncOffset)
  const setSyncOffset = usePlayerStore((s) => s.setSyncOffset)
  const setLyricsFollowMode = usePlayerStore((s) => s.setLyricsFollowMode)
  const setEnglishStatus = usePlayerStore((s) => s.setEnglishStatus)
  const setContentWarning = usePlayerStore((s) => s.setContentWarning)
  const setVerificationScore = usePlayerStore((s) => s.setVerificationScore)
  const focusMode = usePlayerStore((s) => s.focusMode)
  const resolvedMetadataRef = useRef<Awaited<ReturnType<typeof resolveTrackMetadata>> | null>(null)

  const { available, translating } = useTranslation(languageCode)

  const getTime = useCallback(() => currentTime, [currentTime])
  useLyricsSync(getTime)
  useKeyboardShortcuts()

  useEffect(() => {
    bindControls({ play, pause, seek: seekTo, isPlaying })
  }, [bindControls, play, pause, seekTo, isPlaying])

  useEffect(() => {
    syncMkvExportFromUrl()
  }, [])

  useEffect(() => {
    if (!videoId) return
    resetSyncOffset()
    setLyricsFollowMode("follow")
    setVideoId(videoId)
    loadedRef.current = false
    oembedAuthorRef.current = null
    transcribeAbortRef.current?.abort()
    alignAbortRef.current?.abort()
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
        cached.aligned ?? cached.providerId === "transcription",
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
    setMeta,
    setLanguageCode,
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
      const lang = detectLanguage(sample || nativeLines.join("\n"))
      setLanguageCode(lang)

      if (!english || english.status === "skipped") {
        setEnglishStatus("skipped")
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
      const english = await resolveEnglishLyrics({
        track,
        artist,
        nativeLines,
        language: detectLanguage(sample || nativeLines.join("\n")),
        durationSec,
        videoId,
        onProgress: (phase) => setLyricsSearchPhase(phase),
      })
      applyEnglishResult(english, nativeLines, sample)
      const cached = getLyricsCache(videoId)
      if (cached && english.status === "ready") {
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
    ) => {
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
      addRecentSong({
        videoId,
        title: meta.title || meta.track,
        artist: meta.artist,
        track: meta.track,
      })
      void enrichRecentSongEnglish(videoId)
      setStatus("ready")
      if (cachePayload) setLyricsCache(cachePayload)
      if (preResolvedEnglish) {
        applyEnglishResult(preResolvedEnglish, parsed.lines.map((l) => l.text), sample)
      } else if (!cachePayload?.englishLines?.length) {
        await ensureEnglishLyrics(
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
    ],
  )

  const tryTranscribeLyrics = useCallback(
    async (
      artist: string,
      track: string,
      title: string,
      durationSec: number,
      signal?: AbortSignal,
    ): Promise<boolean> => {
      const requestId = ++transcribeRequestRef.current
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

        if (signal?.aborted || requestId !== transcribeRequestRef.current) return false

        const state = usePlayerStore.getState()
        if (state.videoId !== videoId || requestId !== transcribeRequestRef.current) return false

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
        const lang = detectLanguage(plainLyrics)
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
        )

        if (transcript.partial) {
          setLyricsSearchPhase("Transcribed partial audio — timing may drift on long tracks")
        }

        return true
      } catch (err) {
        if (signal?.aborted || requestId !== transcribeRequestRef.current) return false
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
      signal?: AbortSignal,
    ) => {
      const requestId = ++alignRequestRef.current
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
        if (requestId !== alignRequestRef.current) return

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
        if (state.videoId !== videoId || requestId !== alignRequestRef.current) return

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
      )

      if (!parsed.synced && parsed.lines.length > 0) {
        alignAbortRef.current?.abort()
        const controller = new AbortController()
        alignAbortRef.current = controller
        void tryAlignPlainLyrics(
          parsed.lines,
          meta.artist,
          meta.track,
          meta.title,
          durationSec,
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
        await tryTranscribeLyrics(artist, track, title, durationSec, controller.signal)
        return
      }

      if (!options?.skipPasted) {
        const pasted = getPastedLyrics(videoId)
        if (pasted) {
          const parsed = applyLyricsText(pasted, durationSec)
          if (parsed) {
            if (parsed.suggestedOffsetMs) setSyncOffset(parsed.suggestedOffsetMs)
            else resetSyncOffset()
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
          setEnglishLines(cached.englishLines)
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
              languageCode: cached.languageCode,
              title: cached.title || title,
              artist: cached.artist || artist,
              track: cached.track || track,
              parsedDurationMs: durationMs,
            },
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
          videoId,
          oembedAuthor: oembedAuthorRef.current ?? undefined,
          resolvedMetadata: resolvedMetadataRef.current ?? undefined,
          preferredLanguage: inferPreferredLanguage({
            title,
            artist,
            track,
            oembedAuthor: oembedAuthorRef.current ?? undefined,
          }),
          providerIds: options?.providerIds,
          onProgress: ({ phase, step, retryRound, providersTried }) => {
            setLyricsSearchPhase(phase)
            setLyricsSearchStep(step)
            if (providersTried) setLyricsProvidersSearched(providersTried)
            if (retryRound) setNetworkRetryCount(retryRound)
          },
        })

        if (usePlayerStore.getState().videoId !== videoId) return

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
          const applied = await applyLyricsFromRaw(
            result.lyrics,
            { title, track, artist },
            durationSec,
            result.alternates ?? [],
            result.english,
          )
          if (applied && result.status === "instrumental") {
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
            controller.signal,
          )
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
    loadedRef.current = true

    const load = async () => {
      const title = await getVideoTitle()
      const oembedAuthor =
        oembedAuthorRef.current ?? (await fetchYouTubeAuthor(videoId))
      if (oembedAuthor) oembedAuthorRef.current = oembedAuthor

      const rough = parseTrackTitle(title, oembedAuthor ?? undefined)
      setLyricsSearchPhase("Resolving song…")
      setLyricsSearchStep("parse")

      const resolved = await resolveTrackMetadata({
        title,
        durationSec: duration,
        oembedAuthor: oembedAuthor ?? undefined,
        roughArtist: rough.artist,
        roughTrack: rough.track,
      })
      resolvedMetadataRef.current = resolved
      setMeta({ title, artist: resolved.artist, track: resolved.track })
      await loadLyrics(resolved.artist, resolved.track, title, duration)
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

  const handleRefreshLyrics = useCallback(async () => {
    if (duration <= 0 || usePlayerStore.getState().status === "loading") return

    transcribeAbortRef.current?.abort()
    alignAbortRef.current?.abort()
    setLoadedFromCache(false)
    setContentWarning(null)
    setVerificationScore(null)

    const title = await getVideoTitle()
    setLyricsSearchPhase("Resolving song…")
    setLyricsSearchStep("parse")

    const rough = parseTrackTitle(title, oembedAuthorRef.current ?? undefined)
    const resolved = await resolveTrackMetadata({
      title,
      durationSec: duration,
      oembedAuthor: oembedAuthorRef.current ?? undefined,
      roughArtist: rough.artist,
      roughTrack: rough.track,
    })
    resolvedMetadataRef.current = resolved
    setMeta({ title, artist: resolved.artist, track: resolved.track })
    await loadLyrics(resolved.artist, resolved.track, title, duration, {
      skipPasted: true,
      skipCache: true,
    })
  }, [
    duration,
    getVideoTitle,
    loadLyrics,
    setMeta,
    setLyricsSearchPhase,
    setLyricsSearchStep,
    setLoadedFromCache,
    setContentWarning,
    setVerificationScore,
  ])

  const handleTranscribe = useCallback(() => {
    const { title, artist, track } = usePlayerStore.getState()
    void loadLyrics(artist, track, title, duration, {
      skipPasted: true,
      skipCache: true,
      transcribeOnly: true,
    })
  }, [duration, loadLyrics])

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
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          focusMode ? "h-dvh" : "h-[calc(100dvh-3.25rem)]",
        )}
      >
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
                {playbackHint ? ` · ${playbackHint}` : ""}
              </span>
            )}
          </div>
        )}

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
            {!focusMode && (
              <NowPlayingHeader
                onSelectAlternate={handleSelectAlternate}
                onTranslate={() => void handleTranslate()}
                onRefreshLyrics={() => void handleRefreshLyrics()}
                translating={translating}
                showTranslate={
                  !isEnglish(languageCode) &&
                  englishLines.length === 0 &&
                  (available || translating)
                }
              />
            )}

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
          playbackHint={playbackHint}
          onPlay={play}
          onPause={pause}
          onSeek={seekTo}
          onRefreshLyrics={() => void handleRefreshLyrics()}
        />
      </div>
    </AppShell>
  )
}
