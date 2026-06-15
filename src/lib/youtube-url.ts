export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = trimmed.match(p)
    if (m) return m[1]
  }
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  return null
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youTubeMusicWatchUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`
}
