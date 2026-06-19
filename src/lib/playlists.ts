import { normalizeTrackMetadata, type TrackMetadata } from "@/lib/track-label"

export const PLAYLISTS_STORAGE_KEY = "song-kara-playlists"
export const MAX_PLAYLISTS = 20
export const MAX_TRACKS_PER_PLAYLIST = 100
export const PLAYLIST_ID_PREFIX = "playlist-"

export type PlaylistTrack = TrackMetadata & {
  addedAt: number
}

export type Playlist = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  tracks: PlaylistTrack[]
}

export type PlaylistPlaybackContext = {
  playlistId: string
  trackIndex: number
}

function isPlaylistTrack(value: unknown): value is PlaylistTrack {
  if (!value || typeof value !== "object") return false
  const t = value as Partial<PlaylistTrack>
  return (
    typeof t.videoId === "string" &&
    typeof t.title === "string" &&
    typeof t.addedAt === "number"
  )
}

function isPlaylistRecord(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") return false
  const p = value as Partial<Playlist>
  return (
    typeof p.id === "string" &&
    p.id.startsWith(PLAYLIST_ID_PREFIX) &&
    typeof p.name === "string" &&
    typeof p.createdAt === "string" &&
    typeof p.updatedAt === "string" &&
    Array.isArray(p.tracks) &&
    p.tracks.every(isPlaylistTrack)
  )
}

export function isPlaylistId(id: string): boolean {
  return id.startsWith(PLAYLIST_ID_PREFIX)
}

export function createPlaylistId(): string {
  return `${PLAYLIST_ID_PREFIX}${crypto.randomUUID()}`
}

function normalizeTrack(track: PlaylistTrack): PlaylistTrack {
  return {
    ...normalizeTrackMetadata(track),
    addedAt: track.addedAt,
  }
}

function normalizePlaylist(playlist: Playlist): Playlist {
  return {
    ...playlist,
    tracks: playlist.tracks.map(normalizeTrack).slice(0, MAX_TRACKS_PER_PLAYLIST),
  }
}

export function readPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlaylistRecord).map(normalizePlaylist)
  } catch {
    return []
  }
}

function writePlaylists(playlists: Playlist[]): void {
  localStorage.setItem(
    PLAYLISTS_STORAGE_KEY,
    JSON.stringify(playlists.slice(0, MAX_PLAYLISTS)),
  )
}

export function getPlaylistById(id: string): Playlist | undefined {
  return readPlaylists().find((p) => p.id === id)
}

export function createPlaylist(name: string): { playlist: Playlist; error?: string } {
  const playlists = readPlaylists()
  if (playlists.length >= MAX_PLAYLISTS) {
    return { playlist: playlists[0], error: `Maximum ${MAX_PLAYLISTS} playlists reached` }
  }

  const now = new Date().toISOString()
  const playlist: Playlist = {
    id: createPlaylistId(),
    name: name.trim() || "Untitled playlist",
    createdAt: now,
    updatedAt: now,
    tracks: [],
  }

  playlists.unshift(playlist)
  writePlaylists(playlists)
  return { playlist }
}

export function renamePlaylist(id: string, name: string): { playlist?: Playlist; error?: string } {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === id)
  if (index === -1) return { error: "Playlist not found" }

  const now = new Date().toISOString()
  playlists[index] = {
    ...playlists[index],
    name: name.trim() || playlists[index].name,
    updatedAt: now,
  }
  writePlaylists(playlists)
  return { playlist: playlists[index] }
}

export function deletePlaylist(id: string): void {
  if (!isPlaylistId(id)) return
  writePlaylists(readPlaylists().filter((p) => p.id !== id))
}

export function addTrackToPlaylist(
  playlistId: string,
  track: Omit<PlaylistTrack, "addedAt">,
): { playlist?: Playlist; error?: string } {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === playlistId)
  if (index === -1) return { error: "Playlist not found" }

  const playlist = playlists[index]
  const normalized = normalizeTrack({ ...track, addedAt: Date.now() })
  const withoutDuplicate = playlist.tracks.filter((t) => t.videoId !== normalized.videoId)

  if (withoutDuplicate.length >= MAX_TRACKS_PER_PLAYLIST) {
    return { error: `Maximum ${MAX_TRACKS_PER_PLAYLIST} tracks per playlist` }
  }

  const now = new Date().toISOString()
  playlists[index] = {
    ...playlist,
    tracks: [...withoutDuplicate, normalized],
    updatedAt: now,
  }
  writePlaylists(playlists)
  return { playlist: playlists[index] }
}

export type BulkAddTracksResult = {
  playlist?: Playlist
  added: number
  skippedDuplicates: number
  truncated: number
  error?: string
}

export function bulkAddTracksToPlaylist(
  playlistId: string,
  tracks: Omit<PlaylistTrack, "addedAt">[],
): BulkAddTracksResult {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === playlistId)
  if (index === -1) return { added: 0, skippedDuplicates: 0, truncated: 0, error: "Playlist not found" }

  const playlist = playlists[index]
  const existingIds = new Set(playlist.tracks.map((track) => track.videoId))
  const nextTracks = [...playlist.tracks]
  let added = 0
  let skippedDuplicates = 0
  let truncated = 0
  const now = Date.now()

  for (const track of tracks) {
    const normalized = normalizeTrack({ ...track, addedAt: now + added })
    if (existingIds.has(normalized.videoId)) {
      skippedDuplicates += 1
      continue
    }
    if (nextTracks.length >= MAX_TRACKS_PER_PLAYLIST) {
      truncated += 1
      continue
    }

    existingIds.add(normalized.videoId)
    nextTracks.push(normalized)
    added += 1
  }

  if (added === 0 && truncated === 0 && skippedDuplicates === tracks.length) {
    return {
      playlist,
      added,
      skippedDuplicates,
      truncated,
      error: "All tracks are already in this playlist",
    }
  }

  const updatedAt = new Date().toISOString()
  playlists[index] = {
    ...playlist,
    tracks: nextTracks,
    updatedAt,
  }
  writePlaylists(playlists)

  return {
    playlist: playlists[index],
    added,
    skippedDuplicates,
    truncated,
  }
}

export function createPlaylistFromImport(
  name: string,
  tracks: Omit<PlaylistTrack, "addedAt">[],
): BulkAddTracksResult & { playlist?: Playlist } {
  const created = createPlaylist(name)
  if (created.error) {
    return {
      added: 0,
      skippedDuplicates: 0,
      truncated: tracks.length,
      error: created.error,
    }
  }

  const result = bulkAddTracksToPlaylist(created.playlist.id, tracks)
  if (result.error && result.added === 0) {
    deletePlaylist(created.playlist.id)
    return result
  }

  return { ...result, playlist: result.playlist ?? created.playlist }
}

export function updatePlaylistTrackMetadata(
  playlistId: string,
  videoId: string,
  metadata: Pick<PlaylistTrack, "artist" | "track" | "title">,
): { playlist?: Playlist; error?: string } {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === playlistId)
  if (index === -1) return { error: "Playlist not found" }

  const playlist = playlists[index]
  const trackIndex = playlist.tracks.findIndex((t) => t.videoId === videoId)
  if (trackIndex === -1) return { error: "Track not found" }

  const current = playlist.tracks[trackIndex]
  const updated = normalizeTrack({
    ...current,
    ...metadata,
    title: metadata.title?.trim() || current.title,
    artist: metadata.artist?.trim() ?? current.artist,
    track: metadata.track?.trim() ?? current.track,
  })

  const tracks = [...playlist.tracks]
  tracks[trackIndex] = updated
  const now = new Date().toISOString()
  playlists[index] = { ...playlist, tracks, updatedAt: now }
  writePlaylists(playlists)
  return { playlist: playlists[index] }
}

export function removeTrackFromPlaylist(
  playlistId: string,
  videoId: string,
): { playlist?: Playlist; error?: string } {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === playlistId)
  if (index === -1) return { error: "Playlist not found" }

  const now = new Date().toISOString()
  playlists[index] = {
    ...playlists[index],
    tracks: playlists[index].tracks.filter((t) => t.videoId !== videoId),
    updatedAt: now,
  }
  writePlaylists(playlists)
  return { playlist: playlists[index] }
}

export function reorderPlaylistTracks(
  playlistId: string,
  fromIndex: number,
  toIndex: number,
): { playlist?: Playlist; error?: string } {
  const playlists = readPlaylists()
  const index = playlists.findIndex((p) => p.id === playlistId)
  if (index === -1) return { error: "Playlist not found" }

  const tracks = [...playlists[index].tracks]
  if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
    return { error: "Invalid track index" }
  }

  const [moved] = tracks.splice(fromIndex, 1)
  tracks.splice(toIndex, 0, moved)

  const now = new Date().toISOString()
  playlists[index] = {
    ...playlists[index],
    tracks,
    updatedAt: now,
  }
  writePlaylists(playlists)
  return { playlist: playlists[index] }
}

export function movePlaylistTrack(
  playlistId: string,
  videoId: string,
  direction: "up" | "down",
): { playlist?: Playlist; error?: string } {
  const playlist = getPlaylistById(playlistId)
  if (!playlist) return { error: "Playlist not found" }

  const fromIndex = playlist.tracks.findIndex((t) => t.videoId === videoId)
  if (fromIndex === -1) return { error: "Track not found" }

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
  if (toIndex < 0 || toIndex >= playlist.tracks.length) {
    return { playlist }
  }

  return reorderPlaylistTracks(playlistId, fromIndex, toIndex)
}

export function getPlaylistTrackAt(
  playlistId: string,
  trackIndex: number,
): PlaylistTrack | undefined {
  const playlist = getPlaylistById(playlistId)
  if (!playlist) return undefined
  return playlist.tracks[trackIndex]
}

export function clearPlaylists(): void {
  localStorage.removeItem(PLAYLISTS_STORAGE_KEY)
}
