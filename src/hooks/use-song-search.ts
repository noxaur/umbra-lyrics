import { useCallback, useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/abort-signal"
import { searchSongs, type SongSearchHit } from "@/lib/youtube-search"

export type SongSearchStatus = "idle" | "searching" | "results" | "error"

export type UseSongSearchOptions = {
  debounceMs?: number
  limit?: number
  minQueryLen?: number
  enabled?: boolean
  emptyMessage?: string
  errorMessage?: string
}

type ActiveSearch = {
  generation: number
  controller: AbortController
}

const DEFAULT_DEBOUNCE_MS = 600
const DEFAULT_LIMIT = 10
const DEFAULT_MIN_QUERY_LEN = 2

export function useSongSearch(options: UseSongSearchOptions = {}) {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    limit = DEFAULT_LIMIT,
    minQueryLen = DEFAULT_MIN_QUERY_LEN,
    enabled = true,
    emptyMessage = "No songs found",
    errorMessage = "Search unavailable",
  } = options

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SongSearchHit[]>([])
  const [status, setStatus] = useState<SongSearchStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const generationRef = useRef(0)
  const activeSearchRef = useRef<ActiveSearch | null>(null)

  const cancelActiveSearch = useCallback(() => {
    activeSearchRef.current?.controller.abort()
    activeSearchRef.current = null
  }, [])

  const resetSearch = useCallback(() => {
    cancelActiveSearch()
    generationRef.current += 1
    setResults([])
    setError(null)
    setStatus("idle")
  }, [cancelActiveSearch])

  const runSearch = useCallback(
    async (value: string) => {
      const trimmed = value.trim()

      if (trimmed.length < minQueryLen) {
        resetSearch()
        return
      }

      cancelActiveSearch()
      const generation = ++generationRef.current
      const controller = new AbortController()
      activeSearchRef.current = { generation, controller }

      setStatus("searching")
      setError(null)

      try {
        const hits = await searchSongs(trimmed, {
          limit,
          signal: controller.signal,
        })

        if (generation !== generationRef.current) return

        setResults(hits)
        if (hits.length === 0) {
          setStatus("error")
          setError(emptyMessage)
          return
        }

        setStatus("results")
        setError(null)
      } catch (err) {
        if (generation !== generationRef.current) return
        if (isAbortError(err)) return

        setResults([])
        setStatus("error")
        setError(errorMessage)
      } finally {
        if (activeSearchRef.current?.generation === generation) {
          activeSearchRef.current = null
        }
      }
    },
    [cancelActiveSearch, emptyMessage, errorMessage, limit, minQueryLen, resetSearch],
  )

  useEffect(() => {
    if (!enabled) {
      resetSearch()
      return
    }

    const trimmed = query.trim()
    if (trimmed.length < minQueryLen) {
      resetSearch()
      return
    }

    const timer = window.setTimeout(() => {
      void runSearch(trimmed)
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      const wasSearching = activeSearchRef.current !== null
      cancelActiveSearch()
      generationRef.current += 1
      if (wasSearching) {
        setStatus((current) => (current === "searching" ? "idle" : current))
      }
    }
  }, [cancelActiveSearch, debounceMs, enabled, minQueryLen, query, resetSearch, runSearch])

  const submitSearch = useCallback(() => {
    void runSearch(query)
  }, [query, runSearch])

  const clearResults = useCallback(() => {
    resetSearch()
    setQuery("")
  }, [resetSearch])

  return {
    query,
    setQuery,
    results,
    status,
    error,
    isSearching: status === "searching",
    submitSearch,
    clearResults,
    resetSearch,
  }
}
