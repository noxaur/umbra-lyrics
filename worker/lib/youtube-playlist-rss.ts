import type { PlaylistImportItem, PlaylistImportResult } from "./youtube-innertube"

const ENTITY_RE = /&(?:#x([0-9a-fA-F]+)|([a-zA-Z]+));/g
const ENTRY_RE = /<entry>([\s\S]*?)<\/entry>/g
const VIDEO_ID_RE = /<yt:videoId>([^<]+)<\/yt:videoId>/
const TITLE_RE = /<title>([^<]*)<\/title>/
const AUTHOR_NAME_RE = /<name>([^<]*)<\/name>/

function decodeXmlEntities(value: string): string {
  return value.replace(ENTITY_RE, (_, hex: string, named: string) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16))
    switch (named) {
      case "amp":
        return "&"
      case "lt":
        return "<"
      case "gt":
        return ">"
      case "quot":
        return '"'
      case "apos":
        return "'"
      default:
        return named
    }
  })
}

export function parseYouTubePlaylistRss(xml: string, playlistId: string, limit: number): PlaylistImportResult | null {
  if (!playlistId.startsWith("PL")) return null

  const items: PlaylistImportItem[] = []
  for (const match of xml.matchAll(ENTRY_RE)) {
    const entry = match[1]
    const videoId = entry.match(VIDEO_ID_RE)?.[1]?.trim()
    if (!videoId) continue

    const rawTitle = entry.match(TITLE_RE)?.[1]?.trim() ?? videoId
    const title = decodeXmlEntities(rawTitle)
    const channel = decodeXmlEntities(entry.match(AUTHOR_NAME_RE)?.[1]?.trim() ?? "")

    items.push({
      videoId,
      title,
      channel,
      durationSec: null,
    })
    if (items.length >= limit) break
  }

  if (items.length === 0) return null

  return {
    playlistId,
    title: "Imported playlist",
    items,
    truncated: items.length >= limit,
    totalReported: null,
  }
}

export async function fetchPlaylistViaRss(
  playlistId: string,
  limit: number,
): Promise<PlaylistImportResult | null> {
  if (!playlistId.startsWith("PL")) return null

  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  if (!res.ok) return null

  const xml = await res.text()
  return parseYouTubePlaylistRss(xml, playlistId, limit)
}
