import { useCallback, useEffect, useState, type RefObject } from "react"
import { usePlayerStore } from "@/stores/player-store"

function isFullscreenSupported() {
  return typeof document !== "undefined" && document.fullscreenEnabled === true
}

export function useStageFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const stageFullscreen = usePlayerStore((s) => s.stageFullscreen)
  const setStageFullscreen = usePlayerStore((s) => s.setStageFullscreen)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)

  const enter = useCallback(async () => {
    const el = containerRef.current
    if (!el) return

    if (isFullscreenSupported()) {
      try {
        await el.requestFullscreen()
      } catch {
        setStageFullscreen(true)
      }
      return
    }

    setStageFullscreen(true)
  }, [containerRef, setStageFullscreen])

  const exit = useCallback(async () => {
    if (document.fullscreenElement === containerRef.current) {
      try {
        await document.exitFullscreen()
      } catch {
        setStageFullscreen(false)
      }
      return
    }

    setStageFullscreen(false)
  }, [containerRef, setStageFullscreen])

  const toggle = useCallback(() => {
    if (stageFullscreen) void exit()
    else void enter()
  }, [enter, exit, stageFullscreen])

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === containerRef.current
      setNativeFullscreen(active)
      setStageFullscreen(active)
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [containerRef, setStageFullscreen])

  useEffect(() => {
    if (!stageFullscreen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return

      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      e.preventDefault()
      void exit()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [exit, stageFullscreen])

  useEffect(() => {
    return () => {
      if (document.fullscreenElement === containerRef.current) {
        void document.exitFullscreen().catch(() => {})
      }
      setStageFullscreen(false)
    }
  }, [containerRef, setStageFullscreen])

  return {
    stageFullscreen,
    nativeFullscreen,
    enter,
    exit,
    toggle,
    supported: isFullscreenSupported(),
  }
}
