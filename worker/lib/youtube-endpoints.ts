type QueryParams = Record<string, string | number | undefined>

function withQueryParams(url: URL, params?: QueryParams): string {
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/**
 * Convert music.youtube.com URLs to the equivalent www.youtube.com URL.
 * Any Music link can be played on YouTube by removing the `music.` host prefix.
 */
export function stripMusicYouTubeHost(input: string): string {
  return input.replace(/^(https?:\/\/)music\.youtube\.com\b/i, "$1www.youtube.com")
}

export function youTubeMusicWatchUrl(videoId: string, params?: QueryParams): string {
  return withQueryParams(new URL("https://music.youtube.com/watch"), { v: videoId, ...params })
}

export function youTubeWatchUrl(videoId: string, params?: QueryParams): string {
  return stripMusicYouTubeHost(youTubeMusicWatchUrl(videoId, params))
}

/** Standard YouTube IFrame Player embed (playback form of a Music watch URL). */
export function youTubeIframeEmbedUrl(videoId: string, params?: QueryParams): string {
  return withQueryParams(new URL(`https://www.youtube.com/embed/${videoId}`), params)
}

/** Embeddable iframe src derived from a Music watch link. */
export function youTubePlaybackEmbedUrl(videoId: string, params?: QueryParams): string {
  return youTubeIframeEmbedUrl(videoId, params)
}

export function youTubeMusicPlaylistUrl(playlistId: string): string {
  return withQueryParams(new URL("https://music.youtube.com/playlist"), { list: playlistId })
}

export function youTubePlaylistRssFeedUrls(playlistId: string): string[] {
  const musicFeed = `https://music.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`
  return [musicFeed, stripMusicYouTubeHost(musicFeed)]
}

export function youTubeOEmbedApiUrl(watchUrl: string): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
}

/** oEmbed watch URL candidates: Music first, then www.youtube.com via host strip. */
export function youTubeOEmbedWatchUrls(videoId: string): string[] {
  const musicWatch = youTubeMusicWatchUrl(videoId)
  return [musicWatch, stripMusicYouTubeHost(musicWatch)]
}
