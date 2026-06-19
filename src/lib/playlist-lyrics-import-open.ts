type OpenPlaylistLyricsImportRequest = {
  playlistId: string
  videoIds?: string[]
}

type Listener = (request: OpenPlaylistLyricsImportRequest | null) => void

const listeners = new Set<Listener>()
let pendingRequest: OpenPlaylistLyricsImportRequest | null = null

function notify(): void {
  for (const listener of listeners) {
    listener(pendingRequest)
  }
}

export function openPlaylistLyricsImport(request: OpenPlaylistLyricsImportRequest): void {
  pendingRequest = request
  notify()
}

export function clearPlaylistLyricsImportRequest(): void {
  pendingRequest = null
  notify()
}

export function subscribePlaylistLyricsImportOpen(listener: Listener): () => void {
  listeners.add(listener)
  listener(pendingRequest)
  return () => listeners.delete(listener)
}

export type { OpenPlaylistLyricsImportRequest }
