export type YouTubeOEmbed = {
  title: string
  author_name: string
}

export async function fetchYouTubeOEmbed(videoId: string): Promise<YouTubeOEmbed | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
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
