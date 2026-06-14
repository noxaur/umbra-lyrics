import { useCallback, useEffect, useRef } from "react"
import { Link, useParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { LyricsStage } from "@/components/lyrics-stage"
import { TransportControls } from "@/components/transport-controls"
import { YouTubePanel } from "@/components/youtube-panel"
import { Button } from "@/components/ui/button"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { useLyricsSync } from "@/hooks/use-lyrics-sync"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useTranslation } from "@/hooks/use-translation"
import { parseLrc, parsePlainLyrics } from "@/lib/lrc-parser"
import { fetchLyrics, searchEnglishLyrics } from "@/lib/lyrics-service"
import { detectLanguage, isEnglish } from "@/lib/language-service"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { addRecentSong } from "@/lib/recent-songs"
import { usePlayerStore } from "@/stores/player-store"

export function PlayerPage() {
  const { videoId = "" } = useParams()
  const loadedRef = useRef(false)
  const {
    containerRef,
    ready,
    currentTime,
    duration,
    isPlaying,
    play,
    pause,
    seekTo,
    getVideoTitle,
  } = useYouTubePlayer(videoId)

  const videoHidden = usePlayerStore((s) => s.videoHidden)
  const setStatus = usePlayerStore((s) => s.setStatus)
  const setMeta = usePlayerStore((s) => s.setMeta)
  const setLyrics = usePlayerStore((s) => s.setLyrics)
  const setEnglishLines = usePlayerStore((s) => s.setEnglishLines)
  const setLanguageCode = usePlayerStore((s) => s.setLanguageCode)
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
    loadedRef.current = false
    setStatus("idle")
    setLyrics([], true)
    setEnglishLines([])
    setMeta({ title: "", artist: "", track: "" })
  }, [videoId, setStatus, setLyrics, setEnglishLines, setMeta])

  const loadLyrics = useCallback(
    async (artist: string, track: string, title: string, durationSec: number) => {
      setStatus("loading")
      try {
        setMeta({ title, artist, track })

        const result = await fetchLyrics({
          track,
          artist,
          album: "",
          durationSec: Math.round(durationSec) || 0,
        })

        if (!result) {
          setStatus("error", "No lyrics found for this artist and track")
          return
        }

        let parsed =
          result.syncedLyrics && result.syncedLyrics.trim()
            ? parseLrc(result.syncedLyrics, durationSec * 1000)
            : result.plainLyrics
              ? parsePlainLyrics(result.plainLyrics, durationSec * 1000)
              : { lines: [], synced: false }

        if (parsed.lines.length === 0 && result.plainLyrics) {
          parsed = parsePlainLyrics(result.plainLyrics, durationSec * 1000)
        }

        if (parsed.lines.length === 0) {
          setStatus("error", "Lyrics were found but contain no lines to display")
          return
        }

        setLyrics(parsed.lines, parsed.synced)

        const sample = result.plainLyrics ?? parsed.lines.map((l) => l.text).join("\n")
        const lang = detectLanguage(sample)
        setLanguageCode(lang)

        if (!isEnglish(lang)) {
          const enResult = await searchEnglishLyrics(track, artist, Math.round(durationSec))
          if (enResult?.plainLyrics) {
            const enLines = enResult.plainLyrics.split("\n").filter(Boolean)
            setEnglishLines(enLines)
          }
        }

        addRecentSong({ videoId, title: title || track })
        setStatus("ready")
      } catch {
        setStatus("error", "Failed to load lyrics")
      }
    },
    [
      videoId,
      setStatus,
      setMeta,
      setLyrics,
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
      await loadLyrics(artist, track, title, duration)
    }

    void load()
  }, [ready, videoId, duration, getVideoTitle, loadLyrics])

  const handleRetry = useCallback(
    (artist: string, track: string) => {
      const title = usePlayerStore.getState().title
      void loadLyrics(artist, track, title, duration)
    },
    [duration, loadLyrics],
  )

  const handleTranslate = async () => {
    const translated = await translateLines(lyrics.map((l) => l.text))
    setEnglishLines(translated)
  }

  return (
    <AppShell>
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
          <LyricsStage onRetry={handleRetry} />
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
