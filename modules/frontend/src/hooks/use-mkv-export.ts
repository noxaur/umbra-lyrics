import { useCallback, useRef, useState } from "react"
import { downloadMkvBlob, exportMkv } from "@/lib/mkv-export/mux"
import type { MkvExportInput, MkvExportProgress } from "@/lib/mkv-export/types"

export function useMkvExport() {
  const [progress, setProgress] = useState<MkvExportProgress>("idle")
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setProgress("idle")
  }, [])

  const exportSong = useCallback(async (input: MkvExportInput) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setProgress("loading-ffmpeg")

    try {
      const blob = await exportMkv(input, {
        signal: controller.signal,
        onProgress: (stage) => setProgress(stage),
      })
      downloadMkvBlob(blob, input.artist, input.track || input.title)
      setProgress("done")
      return blob
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setProgress("idle")
        return null
      }
      const message = err instanceof Error ? err.message : "Export failed"
      setError(message)
      setProgress("error")
      return null
    } finally {
      abortRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    setProgress("idle")
    setError(null)
  }, [])

  return {
    progress,
    error,
    exportSong,
    cancel,
    reset,
    isExporting: progress !== "idle" && progress !== "done" && progress !== "error",
  }
}
