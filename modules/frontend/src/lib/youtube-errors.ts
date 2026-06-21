const YOUTUBE_ERROR_MESSAGES: Record<number, string> = {
  2: "Invalid parameter passed to the YouTube player.",
  5: "The HTML5 player encountered an error.",
  100: "The requested video was not found.",
  101: "Embedding is disabled for this video by the owner.",
  150: "Embedding is disabled for this video.",
  153: "Video player configuration error. Try refreshing, or open the video on YouTube.",
}

export function youtubeErrorMessage(code: number, fallback?: string): string {
  return YOUTUBE_ERROR_MESSAGES[code] ?? fallback ?? `YouTube error ${code}`
}
