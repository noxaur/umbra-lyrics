import { isAbortError } from "@/lib/abort-signal"
import { parseTrackTitle } from "@/lib/parse-track-title"
import { readPlaylists } from "@/lib/playlists"
import type { SeedMetadata } from "@/lib/player-navigation"
import { getRecentSongs } from "@/lib/recent-songs"
import { searchSongs, type SongSearchHit } from "@/lib/youtube-search"

const RANDOM_SONG_QUERIES = [
  "Bohemian Rhapsody Queen official",
  "Don't Stop Believin' Journey official",
  "Sweet Caroline Neil Diamond",
  "Wonderwall Oasis official",
  "Mr Brightside The Killers",
  "Livin' on a Prayer Bon Jovi",
  "I Will Always Love You Whitney Houston",
  "Shape of You Ed Sheeran official",
  "Blinding Lights The Weeknd official",
  "Levitating Dua Lipa official",
  "bad guy Billie Eilish official",
  "Rolling in the Deep Adele official",
  "Uptown Funk Bruno Mars official",
  "Happy Pharrell Williams official",
  "Shake It Off Taylor Swift official",
  "Someone Like You Adele official",
  "All of Me John Legend official",
  "Perfect Ed Sheeran official",
  "Shallow Lady Gaga official",
  "Counting Stars OneRepublic official",
  "Believer Imagine Dragons official",
  "Radioactive Imagine Dragons official",
  "Stressed Out Twenty One Pilots official",
  "Take Me to Church Hozier official",
  "Call Me Maybe Carly Rae Jepsen official",
  "Wrecking Ball Miley Cyrus official",
  "Party in the USA Miley Cyrus official",
  "Poker Face Lady Gaga official",
  "Firework Katy Perry official",
  "Roar Katy Perry official",
] as const

export type RandomSongCandidate = {
  videoId: string
  seedMetadata?: SeedMetadata
}

function pickRandomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

export function pickRandomSongQuery(): string {
  return pickRandomItem(RANDOM_SONG_QUERIES)
}

export function collectLocalRandomSongCandidates(excludeVideoId?: string): RandomSongCandidate[] {
  const byId = new Map<string, RandomSongCandidate>()

  for (const song of getRecentSongs()) {
    if (excludeVideoId && song.videoId === excludeVideoId) continue
    byId.set(song.videoId, {
      videoId: song.videoId,
      seedMetadata: {
        artist: song.artist,
        track: song.track,
        source: "youtube-music",
      },
    })
  }

  for (const playlist of readPlaylists()) {
    for (const track of playlist.tracks) {
      if (excludeVideoId && track.videoId === excludeVideoId) continue
      if (byId.has(track.videoId)) continue
      byId.set(track.videoId, {
        videoId: track.videoId,
        seedMetadata: {
          artist: track.artist,
          track: track.track,
          source: "youtube-music",
        },
      })
    }
  }

  return [...byId.values()]
}

function seedMetadataFromSearchHit(hit: SongSearchHit): SeedMetadata | undefined {
  const { artist, track } = parseTrackTitle(hit.title, hit.channel)
  if (!artist && !track) return undefined
  return {
    artist,
    track,
    durationSec: hit.durationSec ?? undefined,
    source: "youtube-music",
  }
}

function pickRandomSearchHit(hits: SongSearchHit[], excludeVideoId?: string): SongSearchHit | null {
  const filtered = excludeVideoId ? hits.filter((hit) => hit.videoId !== excludeVideoId) : hits
  if (filtered.length === 0) return null
  return pickRandomItem(filtered)
}

export async function resolveRandomSong(options?: {
  excludeVideoId?: string
  signal?: AbortSignal
}): Promise<RandomSongCandidate | null> {
  const excludeVideoId = options?.excludeVideoId
  const triedQueries = new Set<string>()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let query = pickRandomSongQuery()
    while (triedQueries.has(query) && triedQueries.size < RANDOM_SONG_QUERIES.length) {
      query = pickRandomSongQuery()
    }
    triedQueries.add(query)

    try {
      const hits = await searchSongs(query, { limit: 12, signal: options?.signal })
      const hit = pickRandomSearchHit(hits, excludeVideoId)
      if (hit) {
        return {
          videoId: hit.videoId,
          seedMetadata: seedMetadataFromSearchHit(hit),
        }
      }
    } catch (err) {
      if (isAbortError(err) || options?.signal?.aborted) throw err
      // Fall through to local candidates or another query attempt.
    }
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  const localCandidates = collectLocalRandomSongCandidates(excludeVideoId)
  if (localCandidates.length === 0) return null
  return pickRandomItem(localCandidates)
}
