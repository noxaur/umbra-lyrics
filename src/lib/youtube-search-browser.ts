import { isAbortError, signalWithTimeout } from "@/lib/abort-signal"
import { searchSongsMusicFirst } from "../../worker/lib/youtube-music-search-shared"
import type { SongSearchHit } from "./youtube-search"

const BROWSER_SEARCH_TIMEOUT_MS = 20_000

const memCache: Record<string, ArrayBuffer> = {}

let innertubeModule: typeof import("youtubei.js/web") | null = null

async function loadInnertube() {
  if (!innertubeModule) {
    innertubeModule = await import("youtubei.js/web")
  }
  return innertubeModule
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
}

export async function searchSongsInBrowser(
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SongSearchHit[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const limit = options?.limit ?? 10
  throwIfAborted(options?.signal)

  const { signal, cleanup } = signalWithTimeout(BROWSER_SEARCH_TIMEOUT_MS, options?.signal)
  try {
    const { Innertube, ClientType } = await loadInnertube()
    throwIfAborted(signal)

    const yt = await Innertube.create({
      generate_session_locally: true,
      client_type: ClientType.MUSIC,
      cache: {
        cache_dir: "yt-cache",
        get: async (key: string) => memCache[key],
        set: async (key: string, value: ArrayBuffer) => {
          memCache[key] = value
        },
        remove: async (key: string) => {
          delete memCache[key]
        },
      },
    })

    throwIfAborted(signal)

    const results = await searchSongsMusicFirst(yt, trimmed, limit)
    throwIfAborted(signal)

    return results
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    throw err
  } finally {
    cleanup()
  }
}
