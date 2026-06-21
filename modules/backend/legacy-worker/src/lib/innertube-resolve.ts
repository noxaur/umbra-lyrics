import type { Innertube } from "youtubei.js/cf-worker"

type BasicInfo = Awaited<ReturnType<Innertube["getBasicInfo"]>>
type ChosenFormat = ReturnType<BasicInfo["chooseFormat"]>

export type StreamKind = "audio" | "video"

export type ResolvedInnertubeStream = {
  url: string
  mimeType: string
  client: string
}

/** Client order tuned for audio extraction (ANDROID_VR often works when ANDROID fails). */
export const INNERTUBE_CLIENT_CHAIN = [
  "IOS",
  "ANDROID_VR",
  "ANDROID",
  "TV_EMBEDDED",
  "WEB_EMBEDDED",
  "MWEB",
  "MUSIC",
  "WEB",
  "TV",
] as const

export type InnertubeClientName = (typeof INNERTUBE_CLIENT_CHAIN)[number]

export type ResolveAttempt = {
  client: string
  status?: string
  reason?: string
  error?: string
  resolved: boolean
}

function playabilityReason(info: { playability_status?: { reason?: string; error_screen?: unknown } }): string {
  const reason = info.playability_status?.reason?.trim()
  if (reason) return reason
  return ""
}

export async function resolveFormatUrl(
  yt: Innertube,
  chosen: ChosenFormat | undefined,
): Promise<string | null> {
  if (!chosen) return null

  let url = chosen.url ?? null
  if (!url) {
    try {
      url = (await chosen.decipher(yt.session.player)) ?? null
    } catch {
      url = null
    }
  }
  return url
}

export async function resolveStreamFromBasicInfo(
  yt: Innertube,
  info: Awaited<ReturnType<Innertube["getBasicInfo"]>>,
  kind: StreamKind,
  client: string,
): Promise<{ stream: ResolvedInnertubeStream; attempt: ResolveAttempt } | { attempt: ResolveAttempt }> {
  const status = info.playability_status?.status
  const reason = playabilityReason(info)

  if (status && status !== "OK" && status !== "CONTENT_CHECK_REQUIRED") {
    return {
      attempt: {
        client,
        status,
        reason,
        resolved: false,
      },
    }
  }

  try {
    const chosen = info.chooseFormat({
      type: kind,
      quality: "best",
      format: kind === "video" ? "mp4" : undefined,
    })

    const url = await resolveFormatUrl(yt, chosen)
    if (!url) {
      return {
        attempt: {
          client,
          status: status ?? "OK",
          reason: reason || "No playable format URL",
          resolved: false,
        },
      }
    }

    return {
      stream: {
        url,
        mimeType: chosen?.mime_type ?? (kind === "audio" ? "audio/mp4" : "video/mp4"),
        client,
      },
      attempt: {
        client,
        status: status ?? "OK",
        reason,
        resolved: true,
      },
    }
  } catch (error) {
    return {
      attempt: {
        client,
        status,
        reason,
        error: error instanceof Error ? error.message : "Format selection failed",
        resolved: false,
      },
    }
  }
}
