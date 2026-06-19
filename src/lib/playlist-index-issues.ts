const STORAGE_KEY = "song-kara-playlist-index-issues"

export type PlaylistIndexIssueReason = "needs_metadata" | "index_failed"

export type PlaylistIndexIssue = {
  videoId: string
  playlistId: string
  title: string
  artist: string
  track: string
  reason: PlaylistIndexIssueReason
  message: string
  createdAt: number
}

type IssueListener = () => void
const listeners = new Set<IssueListener>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function subscribePlaylistIndexIssues(listener: IssueListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readIssues(): PlaylistIndexIssue[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PlaylistIndexIssue =>
        !!item &&
        typeof item === "object" &&
        typeof (item as PlaylistIndexIssue).videoId === "string" &&
        typeof (item as PlaylistIndexIssue).playlistId === "string" &&
        typeof (item as PlaylistIndexIssue).message === "string",
    )
  } catch {
    return []
  }
}

function writeIssues(issues: PlaylistIndexIssue[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues))
  notify()
}

export function listPlaylistIndexIssues(): PlaylistIndexIssue[] {
  return readIssues()
}

export function getPlaylistIndexIssue(videoId: string): PlaylistIndexIssue | undefined {
  return readIssues().find((issue) => issue.videoId === videoId)
}

export function upsertPlaylistIndexIssue(issue: Omit<PlaylistIndexIssue, "createdAt">): void {
  const issues = readIssues().filter((entry) => entry.videoId !== issue.videoId)
  issues.push({ ...issue, createdAt: Date.now() })
  writeIssues(issues)
}

export function clearPlaylistIndexIssue(videoId: string): void {
  const next = readIssues().filter((issue) => issue.videoId !== videoId)
  if (next.length === readIssues().length) return
  writeIssues(next)
}

export function clearPlaylistIndexIssuesForPlaylist(playlistId: string): void {
  writeIssues(readIssues().filter((issue) => issue.playlistId !== playlistId))
}

export function clearPlaylistIndexIssues(): void {
  writeIssues([])
}
