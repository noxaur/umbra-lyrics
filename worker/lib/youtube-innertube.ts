import { ClientType, Innertube } from "youtubei.js/cf-worker"

type StreamKind = "audio" | "video"

export type InnertubeResolvedStream = {
  url: string
  mimeType: string
  client: string
}

const memCache: Record<string, ArrayBuffer> = {}

const innertubeCache = new Map<ClientType, Promise<Innertube>>()

const CLIENT_CHAIN: ClientType[] = [
  ClientType.IOS,
  ClientType.ANDROID,
  ClientType.MWEB,
  ClientType.WEB,
]

function createInnertube(clientType: ClientType): Promise<Innertube> {
  const existing = innertubeCache.get(clientType)
  if (existing) return existing

  const created = Innertube.create({
    generate_session_locally: true,
    client_type: clientType,
    cache: {
      cache_dir: "yt-cache",
      get: async (key: string) => memCache[key],
      set: async (key: string, value: ArrayBuffer) => {
        memCache[key] = value
      },
      remove: async (key: string) => {
        delete memCache[key]
      },
    },
  })

  innertubeCache.set(clientType, created)
  return created
}

export async function resolveStreamViaInnertube(
  videoId: string,
  kind: StreamKind,
): Promise<InnertubeResolvedStream | null> {
  for (const clientType of CLIENT_CHAIN) {
    try {
      const yt = await createInnertube(clientType)
      const info = await yt.getBasicInfo(videoId)
      if (info.playability_status?.status !== "OK") continue

      const chosen = info.chooseFormat({
        type: kind,
        quality: "best",
        format: kind === "video" ? "mp4" : undefined,
      })

      let url = chosen?.url ?? null
      if (!url && chosen) {
        try {
          url = (await chosen.decipher(yt.session.player)) ?? null
        } catch {
          url = null
        }
      }
      if (!url) continue

      return {
        url,
        mimeType: chosen?.mime_type ?? (kind === "audio" ? "audio/mp4" : "video/mp4"),
        client: String(clientType),
      }
    } catch {
      // try next client
    }
  }

  return null
}
