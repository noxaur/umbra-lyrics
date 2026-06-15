import { ClientType, Innertube } from "youtubei.js/cf-worker"
import {
  INNERTUBE_CLIENT_CHAIN,
  type InnertubeClientName,
  type ResolveAttempt,
  type ResolvedInnertubeStream,
  resolveStreamFromBasicInfo,
} from "./innertube-resolve"

export type { ResolvedInnertubeStream as InnertubeResolvedStream, ResolveAttempt }

type StreamKind = "audio" | "video"

const memCache: Record<string, ArrayBuffer> = {}

const innertubeCache = new Map<string, Promise<Innertube>>()

function clientTypeFromName(name: InnertubeClientName): ClientType {
  return ClientType[name as keyof typeof ClientType] ?? ClientType.WEB
}

function createInnertube(clientType: ClientType): Promise<Innertube> {
  const key = String(clientType)
  const existing = innertubeCache.get(key)
  if (existing) return existing

  const created = Innertube.create({
    generate_session_locally: true,
    client_type: clientType,
    cache: {
      cache_dir: "yt-cache",
      get: async (cacheKey: string) => memCache[cacheKey],
      set: async (cacheKey: string, value: ArrayBuffer) => {
        memCache[cacheKey] = value
      },
      remove: async (cacheKey: string) => {
        delete memCache[cacheKey]
      },
    },
  })

  innertubeCache.set(key, created)
  return created
}

export async function resolveStreamViaInnertube(
  videoId: string,
  kind: StreamKind,
): Promise<ResolvedInnertubeStream | null> {
  const result = await resolveStreamViaInnertubeDetailed(videoId, kind)
  return result.stream
}

export async function resolveStreamViaInnertubeDetailed(
  videoId: string,
  kind: StreamKind,
): Promise<{ stream: ResolvedInnertubeStream | null; attempts: ResolveAttempt[] }> {
  const attempts: ResolveAttempt[] = []

  for (const clientName of INNERTUBE_CLIENT_CHAIN) {
    const clientType = clientTypeFromName(clientName)
    try {
      const yt = await createInnertube(clientType)
      const info = await yt.getBasicInfo(videoId)
      const outcome = await resolveStreamFromBasicInfo(yt, info, kind, clientName)
      attempts.push(outcome.attempt)
      if ("stream" in outcome && outcome.stream) {
        return { stream: outcome.stream, attempts }
      }
    } catch (error) {
      attempts.push({
        client: clientName,
        error: error instanceof Error ? error.message : "Client failed",
        resolved: false,
      })
    }
  }

  return { stream: null, attempts }
}
