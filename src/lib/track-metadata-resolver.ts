import { proxyFetch } from "@/lib/lyrics-providers/api-base"
import { artistMatchScore, trackMatchScore } from "@/lib/lyrics-providers/match-utils"
import {
  extractTopicChannelArtist,
  parseTrackTitle,
  simplifyTrackName,
  stripChannelSuffix,
} from "@/lib/parse-track-title"

export type MetadataSource = "spotify" | "musicbrainz" | "deezer" | "itunes" | "parse" | "oembed"

export type MetadataCandidate = {
  artist: string
  track: string
  source: MetadataSource
  confidence: number
  durationSec?: number
  externalIds?: { spotify?: string; musicbrainz?: string; isrc?: string }
}

export type ResolvedTrackMetadata = {
  artist: string
  track: string
  source: MetadataSource
  confidence: number
  durationSec?: number
  externalIds?: { spotify?: string; musicbrainz?: string; isrc?: string }
  alternates: MetadataCandidate[]
}

export type ResolveTrackMetadataParams = {
  title: string
  durationSec?: number
  oembedAuthor?: string
  roughArtist?: string
  roughTrack?: string
}

const SOURCE_PRIORITY: Record<MetadataSource, number> = {
  spotify: 0,
  musicbrainz: 1,
  deezer: 2,
  itunes: 3,
  oembed: 4,
  parse: 5,
}

type MbRecording = {
  id: string
  title: string
  length?: number
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>
}

function durationDeltaScore(candidateSec: number | undefined, targetSec: number): number {
  if (!targetSec || !candidateSec) return 20
  const delta = Math.abs(candidateSec - targetSec)
  if (delta <= 3) return 0
  if (delta <= 10) return 5
  if (delta <= 30) return 15
  return 40
}

function scoreCandidate(
  candidate: Omit<MetadataCandidate, "confidence">,
  params: ResolveTrackMetadataParams,
  roughArtist: string,
  roughTrack: string,
): number {
  const matchable = {
    artistName: candidate.artist,
    trackName: candidate.track,
    duration: candidate.durationSec,
  }
  let score = durationDeltaScore(candidate.durationSec, params.durationSec ?? 0)
  score += artistMatchScore(matchable, roughArtist || params.oembedAuthor || "")
  score += trackMatchScore(matchable, roughTrack)
  score += SOURCE_PRIORITY[candidate.source] * 3

  const channelArtist = params.oembedAuthor?.trim()
    ? stripChannelSuffix(params.oembedAuthor)
    : ""
  if (
    channelArtist &&
    candidate.artist.toLowerCase().includes(channelArtist.toLowerCase())
  ) {
    score -= 5
  }

  const topicArtist = extractTopicChannelArtist(params.oembedAuthor)
  if (
    topicArtist &&
    candidate.artist.toLowerCase() === topicArtist.toLowerCase()
  ) {
    score -= 10
  }

  return Math.max(0, score)
}

async function fetchSpotifyCandidates(
  artist: string,
  track: string,
): Promise<MetadataCandidate[]> {
  const params = new URLSearchParams({ artist, track })
  const res = await proxyFetch(`/api/metadata/spotify/search?${params}`)
  if (!res.ok) return []

  const data = (await res.json()) as {
    hits?: Array<{ id: string; name: string; artist: string; durationSec: number; isrc?: string }>
  }

  return (data.hits ?? []).map((hit) => ({
    artist: hit.artist,
    track: hit.name,
    source: "spotify" as const,
    confidence: 0,
    durationSec: hit.durationSec,
    externalIds: { spotify: hit.id, isrc: hit.isrc },
  }))
}

async function fetchMusicBrainzCandidates(
  artist: string,
  track: string,
): Promise<MetadataCandidate[]> {
  const query = artist.trim()
    ? `recording:"${track}" AND artist:"${artist}"`
    : `recording:"${track}"`
  const q = encodeURIComponent(query)
  const res = await proxyFetch(`/api/lyrics/musicbrainz/recording?query=${q}&fmt=json&limit=5`)
  if (!res.ok) return []

  const data = (await res.json()) as { recordings?: MbRecording[] }
  return (data.recordings ?? [])
    .map((rec): MetadataCandidate | null => {
      const trackName = rec.title?.trim()
      if (!trackName) return null
      const artistName =
        rec["artist-credit"]?.[0]?.name?.trim() ||
        rec["artist-credit"]?.[0]?.artist?.name?.trim() ||
        ""
      return {
        artist: artistName,
        track: trackName,
        source: "musicbrainz",
        confidence: 0,
        durationSec: rec.length ? Math.round(rec.length / 1000) : undefined,
        externalIds: { musicbrainz: rec.id },
      }
    })
    .filter((c): c is MetadataCandidate => c != null)
}

async function fetchDeezerCandidates(q: string): Promise<MetadataCandidate[]> {
  const res = await proxyFetch(`/api/metadata/deezer/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) return []

  const data = (await res.json()) as {
    hits?: Array<{ id: number; name: string; artist: string; durationSec: number; isrc?: string }>
  }

  return (data.hits ?? []).map((hit) => ({
    artist: hit.artist,
    track: hit.name,
    source: "deezer" as const,
    confidence: 0,
    durationSec: hit.durationSec,
    externalIds: { isrc: hit.isrc },
  }))
}

async function fetchItunesCandidates(term: string): Promise<MetadataCandidate[]> {
  const res = await proxyFetch(`/api/metadata/itunes/search?term=${encodeURIComponent(term)}`)
  if (!res.ok) return []

  const data = (await res.json()) as {
    hits?: Array<{ id: number; name: string; artist: string; durationSec: number; isrc?: string }>
  }

  return (data.hits ?? []).map((hit) => ({
    artist: hit.artist,
    track: hit.name,
    source: "itunes" as const,
    confidence: 0,
    durationSec: hit.durationSec,
    externalIds: { isrc: hit.isrc },
  }))
}

function buildParseFallback(params: ResolveTrackMetadataParams): MetadataCandidate[] {
  const rough =
    params.roughArtist != null || params.roughTrack != null
      ? { artist: params.roughArtist ?? "", track: params.roughTrack ?? "" }
      : parseTrackTitle(params.title, params.oembedAuthor)

  const candidates: MetadataCandidate[] = []
  const track = simplifyTrackName(rough.track)
  if (track.trim()) {
    candidates.push({
      artist: rough.artist,
      track,
      source: "parse",
      confidence: 0,
    })
  }

  const topicArtist = extractTopicChannelArtist(params.oembedAuthor)
  if (topicArtist && track.trim() && topicArtist !== rough.artist) {
    candidates.push({
      artist: topicArtist,
      track,
      source: "oembed",
      confidence: 0,
    })
  }

  const channelArtist = params.oembedAuthor?.trim()
    ? stripChannelSuffix(params.oembedAuthor)
    : ""
  if (
    channelArtist &&
    track.trim() &&
    channelArtist !== rough.artist &&
    channelArtist !== topicArtist
  ) {
    candidates.push({
      artist: channelArtist,
      track,
      source: "oembed",
      confidence: 0,
    })
  }

  return candidates
}

function dedupeCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  const seen = new Set<string>()
  const out: MetadataCandidate[] = []
  for (const c of candidates) {
    const key = `${c.artist.toLowerCase()}\0${c.track.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

export async function resolveTrackMetadata(
  params: ResolveTrackMetadataParams,
): Promise<ResolvedTrackMetadata> {
  const rough =
    params.roughArtist != null || params.roughTrack != null
      ? { artist: params.roughArtist ?? "", track: params.roughTrack ?? "" }
      : parseTrackTitle(params.title, params.oembedAuthor)

  const searchTrack = simplifyTrackName(rough.track) || rough.track
  const topicArtist = extractTopicChannelArtist(params.oembedAuthor)
  const searchArtist = rough.artist || topicArtist || ""
  const freeText = [searchArtist, searchTrack].filter(Boolean).join(" ")
  const altFreeText =
    topicArtist && topicArtist !== searchArtist
      ? [topicArtist, searchTrack].filter(Boolean).join(" ")
      : ""

  const [spotify, musicbrainz, deezer, itunes, altDeezer, altItunes] =
    await Promise.allSettled([
      fetchSpotifyCandidates(searchArtist, searchTrack),
      fetchMusicBrainzCandidates(searchArtist, searchTrack),
      freeText ? fetchDeezerCandidates(freeText) : Promise.resolve([]),
      freeText ? fetchItunesCandidates(freeText) : Promise.resolve([]),
      altFreeText ? fetchDeezerCandidates(altFreeText) : Promise.resolve([]),
      altFreeText ? fetchItunesCandidates(altFreeText) : Promise.resolve([]),
    ])

  const all: MetadataCandidate[] = [
    ...(spotify.status === "fulfilled" ? spotify.value : []),
    ...(musicbrainz.status === "fulfilled" ? musicbrainz.value : []),
    ...(deezer.status === "fulfilled" ? deezer.value : []),
    ...(itunes.status === "fulfilled" ? itunes.value : []),
    ...(altDeezer.status === "fulfilled" ? altDeezer.value : []),
    ...(altItunes.status === "fulfilled" ? altItunes.value : []),
    ...buildParseFallback({ ...params, roughArtist: rough.artist, roughTrack: rough.track }),
  ]

  const scored = dedupeCandidates(all).map((candidate) => {
    const rawScore = scoreCandidate(candidate, params, rough.artist, rough.track)
    const confidence = Math.max(0, Math.min(1, 1 - rawScore / 100))
    return { ...candidate, confidence }
  })

  scored.sort((a, b) => b.confidence - a.confidence)

  const best = scored[0] ?? {
    artist: rough.artist,
    track: searchTrack,
    source: "parse" as const,
    confidence: 0.3,
  }

  return {
    artist: best.artist || rough.artist,
    track: best.track || searchTrack,
    source: best.source,
    confidence: best.confidence,
    durationSec: best.durationSec ?? params.durationSec,
    externalIds: best.externalIds,
    alternates: scored.slice(1, 4),
  }
}
