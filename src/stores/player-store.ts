import { create } from "zustand"
import type { LyricDisplayMode, LyricLine } from "@/types/lyrics"

export type PlayerStatus = "idle" | "loading" | "ready" | "error"

type PlayerState = {
  videoId: string | null
  title: string
  artist: string
  track: string
  status: PlayerStatus
  error: string | null
  lyrics: LyricLine[]
  englishLines: string[]
  lyricsSynced: boolean
  languageCode: string
  displayMode: LyricDisplayMode
  currentTime: number
  syncOffsetMs: number
  videoHidden: boolean
  activeIndex: number
  wordProgress: number
  playRef: (() => void) | null
  pauseRef: (() => void) | null
  seekRef: ((s: number) => void) | null
  isPlaying: boolean
  setVideoId: (id: string) => void
  setMeta: (meta: { title: string; artist: string; track: string }) => void
  setStatus: (status: PlayerStatus, error?: string | null) => void
  setLyrics: (lines: LyricLine[], synced: boolean) => void
  setEnglishLines: (lines: string[]) => void
  setLanguageCode: (code: string) => void
  setDisplayMode: (mode: LyricDisplayMode) => void
  setCurrentTime: (t: number) => void
  adjustOffset: (deltaMs: number) => void
  setVideoHidden: (hidden: boolean) => void
  setActive: (index: number, progress: number) => void
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

export const usePlayerStore = create<PlayerState>((set, get) => ({
  videoId: null,
  title: "",
  artist: "",
  track: "",
  status: "idle",
  error: null,
  lyrics: [],
  englishLines: [],
  lyricsSynced: true,
  languageCode: "eng",
  displayMode: "native",
  currentTime: 0,
  syncOffsetMs: 0,
  videoHidden: localStorage.getItem(VIDEO_HIDDEN_KEY) === "true",
  activeIndex: -1,
  wordProgress: 0,
  playRef: null,
  pauseRef: null,
  seekRef: null,
  isPlaying: false,
  setVideoId: (id) => set({ videoId: id }),
  setMeta: (meta) => set(meta),
  setStatus: (status, error = null) => set({ status, error }),
  setLyrics: (lines, synced) => set({ lyrics: lines, lyricsSynced: synced }),
  setEnglishLines: (lines) => set({ englishLines: lines }),
  setLanguageCode: (code) => set({ languageCode: code }),
  setDisplayMode: (mode) => set({ displayMode: mode }),
  setCurrentTime: (t) => set({ currentTime: t }),
  adjustOffset: (deltaMs) =>
    set((s) => ({ syncOffsetMs: s.syncOffsetMs + deltaMs })),
  setVideoHidden: (hidden) => {
    localStorage.setItem(VIDEO_HIDDEN_KEY, String(hidden))
    set({ videoHidden: hidden })
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
