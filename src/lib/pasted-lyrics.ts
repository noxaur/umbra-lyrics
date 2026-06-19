const STORAGE_KEY = "umbra-pasted-lyrics"

type PastedLyricsStore = Record<string, { text: string; savedAt: number }>

function readStore(): PastedLyricsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as PastedLyricsStore
  } catch {
    return {}
  }
}

function writeStore(store: PastedLyricsStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function getPastedLyrics(videoId: string): string | null {
  return readStore()[videoId]?.text ?? null
}

export function savePastedLyrics(videoId: string, text: string): void {
  const store = readStore()
  store[videoId] = { text, savedAt: Date.now() }
  writeStore(store)
}

export function clearPastedLyrics(videoId: string): void {
  const store = readStore()
  delete store[videoId]
  writeStore(store)
}
