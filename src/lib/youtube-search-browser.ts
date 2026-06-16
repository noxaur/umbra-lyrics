import { mapSearchVideos, searchCandidateLimit } from "../../worker/lib/youtube-search-map"
import { rankSongSearchHits } from "../../worker/lib/youtube-search-rank"
import type { SongSearchHit } from "./youtube-search"

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

  const { Innertube } = await loadInnertube()
  const yt = await Innertube.create({
    generate_session_locally: true,
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

  throwIfAborted(options?.signal)

  const search = await yt.search(trimmed, { type: "video" })
  const mapped = mapSearchVideos(
    [...search.videos] as Parameters<typeof mapSearchVideos>[0],
    searchCandidateLimit(limit),
  )

  throwIfAborted(options?.signal)

  return rankSongSearchHits(mapped).slice(0, limit)
}
