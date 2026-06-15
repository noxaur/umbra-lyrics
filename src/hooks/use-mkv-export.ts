import { useCallback, useRef, useState } from "react"
import { downloadLyricsPackZip } from "@/lib/mkv-export/lyrics-pack"
import { downloadMkvBlob, exportMkv, exportMkvFromLocalFile } from "@/lib/mkv-export/mux"
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

  const runExport = useCallback(
    async (input: MkvExportInput, mediaFile: File | null) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setError(null)
      setProgress("loading-ffmpeg")

      const callbacks = {
        signal: controller.signal,
        onProgress: (stage: MkvExportProgress) => setProgress(stage),
      }

      if (mediaFile) {
        return exportMkvFromLocalFile(input, mediaFile, callbacks)
      }

      return exportMkv(input, callbacks)
    },
    [],
  )

  const exportSong = useCallback(
    async (input: MkvExportInput, mediaFile: File | null) => {
      try {
        const blob = await runExport(input, mediaFile)
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
    },
    [runExport],
  )

  const exportLyricsOnly = useCallback(async (input: MkvExportInput) => {
    setError(null)
    try {
      await downloadLyricsPackZip(input)
      setProgress("done")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed"
      setError(message)
      setProgress("error")
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
    exportLyricsOnly,
    cancel,
    reset,
    isExporting: progress !== "idle" && progress !== "done" && progress !== "error",
  }
}
