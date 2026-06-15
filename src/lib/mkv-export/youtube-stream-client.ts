import type { StreamFormat } from "@/lib/mkv-export/stream-fetch"

export type ClientResolvedStream = {
  url: string
  mimeType: string
  client: string
}

const memCache: Record<string, ArrayBuffer> = {}

let innertubeModule: typeof import("youtubei.js/web") | null = null

async function loadInnertube() {
  if (!innertubeModule) {
    innertubeModule = await import("youtubei.js/web")
  }
  return innertubeModule
}

export async function resolveYouTubeStreamInBrowser(
  videoId: string,
  format: StreamFormat,
): Promise<ClientResolvedStream | null> {
  const { Innertube, ClientType } = await loadInnertube()

  const clients = [ClientType.IOS, ClientType.ANDROID, ClientType.MWEB, ClientType.WEB]

  for (const clientType of clients) {
    try {
      const yt = await Innertube.create({
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

      const info = await yt.getBasicInfo(videoId)
      if (info.playability_status?.status !== "OK") continue

      const chosen = info.chooseFormat({
        type: format,
        quality: "best",
        format: format === "video" ? "mp4" : undefined,
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
        mimeType: chosen?.mime_type ?? (format === "audio" ? "audio/mp4" : "video/mp4"),
        client: String(clientType),
      }
    } catch {
      // try next client
    }
  }

  return null
}

export function encodeStreamProxyPath(targetUrl: string): string {
  const encoded = btoa(targetUrl)
  return `/api/beta/youtube/proxy-url?u=${encodeURIComponent(encoded)}`
}
