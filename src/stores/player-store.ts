import { create } from "zustand"
import type { LyricDisplayMode, LyricLine, LyricsAlternate, LyricsProviderId } from "@/types/lyrics"
import type { LyricsOrchestratorStatus, LyricsSearchStep } from "@/lib/lyrics-orchestrator"
import type { TranslationBackend } from "@/lib/translation-service"

export type PlayerStatus = "idle" | "loading" | "ready" | "error"
export type LyricsSource = LyricsProviderId | "pasted" | "translated" | null
export type EnglishSource = "found" | "translated" | null

type PlayerState = {
  videoId: string | null
  title: string
  artist: string
  track: string
  status: PlayerStatus
  error: string | null
  lyrics: LyricLine[]
  englishLines: string[]
  englishSource: EnglishSource
  translationBackend: TranslationBackend | null
  lyricsSynced: boolean
  lyricsAutoTimed: boolean
  lyricsAligned: boolean
  focusMode: boolean
  tvMode: boolean
  lyricsSource: LyricsSource
  lyricsOutcome: LyricsOrchestratorStatus | "network_error" | null
  lyricsSearchPhase: string | null
  lyricsSearchStep: LyricsSearchStep | null
  lyricsAttempts: string[]
  lyricsAlternates: LyricsAlternate[]
  lyricsProvidersSearched: LyricsProviderId[]
  networkRetryCount: number
  lrclibTrackId: number | null
  languageCode: string
  displayMode: LyricDisplayMode
  currentTime: number
  syncOffsetMs: number
  videoHidden: boolean
  showTimestamps: boolean
  activeIndex: number
  wordProgress: number
  loadedFromCache: boolean
  playRef: (() => void) | null
  pauseRef: (() => void) | null
  seekRef: ((s: number) => void) | null
  isPlaying: boolean
  setVideoId: (id: string) => void
  setMeta: (meta: { title: string; artist: string; track: string }) => void
  setStatus: (status: PlayerStatus, error?: string | null) => void
  setLyrics: (
    lines: LyricLine[],
    synced: boolean,
    source?: LyricsSource,
    autoTimed?: boolean,
    aligned?: boolean,
  ) => void
  setEnglishLines: (
    lines: string[],
    source?: EnglishSource,
    backend?: TranslationBackend | null,
  ) => void
  setLanguageCode: (code: string) => void
  setDisplayMode: (mode: LyricDisplayMode) => void
  setCurrentTime: (t: number) => void
  adjustOffset: (deltaMs: number) => void
  setVideoHidden: (hidden: boolean) => void
  setShowTimestamps: (show: boolean) => void
  setFocusMode: (on: boolean) => void
  setTvMode: (on: boolean) => void
  resetSyncOffset: () => void
  setSyncOffset: (ms: number) => void
  setActive: (index: number, progress: number) => void
  setLyricsSearchPhase: (phase: string | null) => void
  setLyricsSearchStep: (step: LyricsSearchStep | null) => void
  addLyricsAttempt: (strategy: string) => void
  setLyricsAlternates: (alternates: LyricsAlternate[]) => void
  setLyricsProvidersSearched: (providers: LyricsProviderId[]) => void
  resetLyricsSearch: () => void
  setLyricsOutcome: (outcome: LyricsOrchestratorStatus | "network_error" | null) => void
  setNetworkRetryCount: (count: number) => void
  setLrclibTrackId: (id: number | null) => void
  setLoadedFromCache: (fromCache: boolean) => void
  bindControls: (controls: {
    play: () => void
    pause: () => void
    seek: (s: number) => void
    isPlaying: boolean
  }) => void
  togglePlay: () => void
  seekBy: (deltaSec: number) => void
  seekToMs: (ms: number) => void
}

const VIDEO_HIDDEN_KEY = "song-kara-video-hidden"
const SHOW_TIMESTAMPS_KEY = "song-kara-show-timestamps"
const FOCUS_MODE_KEY = "song-kara-focus-mode"
const TV_MODE_KEY = "song-kara-tv-mode"

export const usePlayerStore = create<PlayerState>((set, get) => ({
  videoId: null,
  title: "",
  artist: "",
  track: "",
  status: "idle",
  error: null,
  lyrics: [],
  englishLines: [],
  englishSource: null,
  translationBackend: null,
  lyricsSynced: true,
  lyricsAutoTimed: false,
  lyricsAligned: false,
  lyricsSource: null,
  lyricsOutcome: null,
  lyricsSearchPhase: null,
  lyricsSearchStep: null,
  lyricsAttempts: [],
  lyricsAlternates: [],
  lyricsProvidersSearched: [],
  networkRetryCount: 0,
  lrclibTrackId: null,
  languageCode: "en",
  displayMode: "native",
  currentTime: 0,
  syncOffsetMs: 0,
  videoHidden: localStorage.getItem(VIDEO_HIDDEN_KEY) === "true",
  showTimestamps: localStorage.getItem(SHOW_TIMESTAMPS_KEY) !== "false",
  focusMode: localStorage.getItem(FOCUS_MODE_KEY) === "true",
  tvMode: localStorage.getItem(TV_MODE_KEY) === "true",
  activeIndex: -1,
  wordProgress: 0,
  loadedFromCache: false,
  playRef: null,
  pauseRef: null,
  seekRef: null,
  isPlaying: false,
  setVideoId: (id) => set({ videoId: id }),
  setMeta: (meta) => set(meta),
  setStatus: (status, error = null) => set({ status, error }),
  setLyrics: (lines, synced, source = "lrclib", autoTimed = false, aligned = false) =>
    set({
      lyrics: lines,
      lyricsSynced: synced,
      lyricsAutoTimed: !synced && autoTimed && !aligned,
      lyricsAligned: aligned,
      lyricsSource: source,
    }),
  setEnglishLines: (lines, source = null, backend = null) =>
    set({ englishLines: lines, englishSource: source, translationBackend: backend }),
  setLanguageCode: (code) => set({ languageCode: code }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setLyricsSearchPhase: (phase) => set({ lyricsSearchPhase: phase }),
  setLyricsSearchStep: (step) => set({ lyricsSearchStep: step }),
  addLyricsAttempt: (strategy) =>
    set((s) => ({
      lyricsAttempts: [...s.lyricsAttempts.filter((a) => a !== strategy), strategy].slice(-8),
    })),
  setLyricsAlternates: (alternates) => set({ lyricsAlternates: alternates }),
  setLyricsProvidersSearched: (providers) => set({ lyricsProvidersSearched: providers }),
  resetLyricsSearch: () =>
    set({
      lyricsSearchPhase: null,
      lyricsSearchStep: null,
      lyricsAttempts: [],
      lyricsAlternates: [],
      lyricsProvidersSearched: [],
      networkRetryCount: 0,
      lyricsOutcome: null,
      lrclibTrackId: null,
      lyricsSource: null,
      englishSource: null,
      translationBackend: null,
      error: null,
    }),
  setLyricsOutcome: (outcome) => set({ lyricsOutcome: outcome }),
  setNetworkRetryCount: (count) => set({ networkRetryCount: count }),
  setLrclibTrackId: (id) => set({ lrclibTrackId: id }),
  setLoadedFromCache: (fromCache) => set({ loadedFromCache: fromCache }),
  adjustOffset: (deltaMs) =>
    set((s) => ({ syncOffsetMs: Math.max(-5000, Math.min(5000, s.syncOffsetMs + deltaMs)) })),
  setSyncOffset: (ms) => set({ syncOffsetMs: Math.max(-5000, Math.min(5000, ms)) }),
  resetSyncOffset: () => set({ syncOffsetMs: 0 }),
  setVideoHidden: (hidden) => {
    localStorage.setItem(VIDEO_HIDDEN_KEY, String(hidden))
    set({ videoHidden: hidden })
  },
  setShowTimestamps: (show) => {
    localStorage.setItem(SHOW_TIMESTAMPS_KEY, String(show))
    set({ showTimestamps: show })
  },
  setFocusMode: (on) => {
    localStorage.setItem(FOCUS_MODE_KEY, String(on))
    set({ focusMode: on })
  },
  setTvMode: (on) => {
    localStorage.setItem(TV_MODE_KEY, String(on))
    set({ tvMode: on })
  },
  setActive: (index, progress) => set({ activeIndex: index, wordProgress: progress }),
  bindControls: ({ play, pause, seek, isPlaying }) =>
    set({ playRef: play, pauseRef: pause, seekRef: seek, isPlaying }),
  togglePlay: () => {
    const { isPlaying, playRef, pauseRef } = get()
    if (isPlaying) pauseRef?.()
    else playRef?.()
  },
  seekBy: (deltaSec) => {
    const { currentTime, seekRef } = get()
    seekRef?.(Math.max(0, currentTime + deltaSec))
  },
  seekToMs: (ms) => {
    get().seekRef?.(ms / 1000)
  },
}))
