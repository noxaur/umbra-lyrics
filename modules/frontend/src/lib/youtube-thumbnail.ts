export type YouTubeThumbnailQuality = "default" | "mqdefault" | "hqdefault" | "sddefault" | "maxresdefault"

export function youtubeThumbnailUrl(
  videoId: string,
  quality: YouTubeThumbnailQuality = "mqdefault",
): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`
}
