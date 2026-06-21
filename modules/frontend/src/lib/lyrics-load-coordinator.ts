type ActiveLoad = {
  videoId: string
  generation: number
  promise: Promise<void>
}

const generations = new Map<string, number>()
const activeLoads = new Map<string, ActiveLoad>()

export function bumpLyricsLoadGeneration(videoId: string): number {
  const next = (generations.get(videoId) ?? 0) + 1
  generations.set(videoId, next)
  return next
}

export function getLyricsLoadGeneration(videoId: string): number {
  return generations.get(videoId) ?? 0
}

export function isLyricsLoadStale(videoId: string, generation: number): boolean {
  return generation !== getLyricsLoadGeneration(videoId)
}

export function getActiveLyricsLoad(videoId: string): ActiveLoad | undefined {
  return activeLoads.get(videoId)
}

export function trackLyricsLoad(
  videoId: string,
  generation: number,
  promise: Promise<void>,
): void {
  const entry: ActiveLoad = { videoId, generation, promise }
  activeLoads.set(videoId, entry)
  void promise.finally(() => {
    if (activeLoads.get(videoId) === entry) {
      activeLoads.delete(videoId)
    }
  })
}

export function clearLyricsLoadTracking(videoId: string): void {
  activeLoads.delete(videoId)
}
