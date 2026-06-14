import { proxyFetch } from "@/lib/lyrics-providers/api-base"

export type YouTubeOEmbed = {
  title: string
  author_name: string
}

export async function fetchYouTubeOEmbed(videoId: string): Promise<YouTubeOEmbed | null> {
  const q = new URLSearchParams({ videoId })
  const res = await proxyFetch(`/api/youtube/oembed?${q}`)
  if (!res.ok) return null

  try {
    const data = (await res.json()) as YouTubeOEmbed
    return data
  } catch {
    return null
  }
}

export async function fetchYouTubeAuthor(videoId: string): Promise<string | null> {
  const data = await fetchYouTubeOEmbed(videoId)
  return data?.author_name?.trim() ?? null
}
