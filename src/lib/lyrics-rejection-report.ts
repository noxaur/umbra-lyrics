import {
  LYRICS_PROVIDER_LABELS,
  type LyricsAlternate,
  type LyricsProviderId,
} from "@/types/lyrics"

const ISSUE_URL = "https://github.com/noxaur/umbra-lyrics/issues/new"

type RawLyrics = {
  plainLyrics: string | null
  syncedLyrics: string | null
}

export type LyricsRejectionReport = {
  videoId: string
  title: string
  artist: string
  track: string
  providerId: LyricsProviderId
  synced: boolean
  autoTimed: boolean
  aligned: boolean
  currentLyrics?: RawLyrics
  displayedLines?: string[]
  alternates: LyricsAlternate[]
  providersSearched: LyricsProviderId[]
  attempts: string[]
}

function providerLabel(providerId: LyricsProviderId): string {
  return LYRICS_PROVIDER_LABELS[providerId] ?? providerId
}

function rawLyricsText(lyrics: RawLyrics | undefined, displayedLines: string[] = []): string {
  return (
    lyrics?.syncedLyrics?.trim() ||
    lyrics?.plainLyrics?.trim() ||
    displayedLines.join("\n").trim() ||
    "No lyrics text available."
  )
}

function timingLabel(report: LyricsRejectionReport): string {
  if (report.aligned) return "Transcribed and aligned"
  if (report.synced) return "Synced"
  if (report.autoTimed) return "Auto-timed"
  return "Plain / approximate"
}

function lyricsBlock(text: string): string {
  return `\`\`\`text\n${text}\n\`\`\``
}

export function buildLyricsRejectionUrl(report: LyricsRejectionReport): string {
  const artist = report.artist.trim() || "Unknown"
  const track = report.track.trim() || report.title.trim() || "Unknown"
  const issueTrack = artist === "Unknown" && track === "Unknown" ? "Unknown track" : `${artist} — ${track}`
  const searched = report.providersSearched.length
    ? report.providersSearched.map(providerLabel).join(", ")
    : "None recorded"
  const attempts = report.attempts.length
    ? report.attempts.map((attempt) => `- ${attempt}`).join("\n")
    : "- None recorded"
  const alternates = report.alternates.length
    ? report.alternates
        .map((alternate) => {
          const text = rawLyricsText(alternate.lyricsResult)
          return [
            `### ${providerLabel(alternate.providerId)} (\`${alternate.providerId}\`)`,
            "",
            `Match: ${alternate.artistName ?? "Unknown artist"} — ${alternate.trackName ?? "Unknown track"} · ${alternate.synced ? "synced" : "plain"} · ${alternate.lineCount} lines`,
            "",
            lyricsBlock(text),
          ].join("\n")
        })
        .join("\n\n")
    : "No alternate lyrics recorded."

  const body = [
    "## Additional details",
    "",
    "<!-- Explain what is wrong: incorrect song, bad transcription, missing lines, timing, etc. -->",
    "",
    "## Track",
    "",
    `- **YouTube:** https://www.youtube.com/watch?v=${report.videoId}`,
    `- **Video ID:** \`${report.videoId}\``,
    `- **Title:** ${report.title.trim() || "Unknown"}`,
    `- **Artist:** ${artist}`,
    `- **Track:** ${track}`,
    `- **Provider:** ${providerLabel(report.providerId)} (\`${report.providerId}\`)`,
    `- **Timing:** ${timingLabel(report)}`,
    "",
    "## Current lyrics",
    "",
    lyricsBlock(rawLyricsText(report.currentLyrics, report.displayedLines)),
    "",
    "## Alternate scraped lyrics",
    "",
    alternates,
    "",
    "## Search diagnostics",
    "",
    `- **Providers searched:** ${searched}`,
    "- **Attempts:**",
    attempts,
  ].join("\n")

  const url = new URL(ISSUE_URL)
  url.searchParams.set("title", `Reject lyrics: ${issueTrack}`)
  url.searchParams.set("body", body)
  return url.toString()
}
