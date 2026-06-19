import {
  LYRICS_PROVIDER_LABELS,
  type LyricsAlternate,
  type LyricsProviderId,
} from "@/types/lyrics"
import { youTubeMusicWatchUrl, youTubeWatchUrl } from "@/lib/youtube-url"

const ISSUE_URL = "https://github.com/noxaur/umbra-lyrics/issues/new"
const MAX_ISSUE_URL_LENGTH = 7500
const MAX_LYRICS_BLOCK_CHARS = 2000
const MAX_ALTERNATES = 3

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

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars)}\n\n… (truncated)`
}

function rawLyricsText(lyrics: RawLyrics | undefined, displayedLines: string[] = []): string {
  const text =
    lyrics?.syncedLyrics?.trim() ||
    lyrics?.plainLyrics?.trim() ||
    displayedLines.join("\n").trim() ||
    "No lyrics text available."
  return truncateText(text, MAX_LYRICS_BLOCK_CHARS)
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
  const includedAlternates = report.alternates.slice(0, MAX_ALTERNATES)
  const omittedAlternateCount = report.alternates.length - includedAlternates.length
  const alternates = includedAlternates.length
    ? [
        ...includedAlternates.map((alternate) => {
          const text = rawLyricsText(alternate.lyricsResult)
          return [
            `### ${providerLabel(alternate.providerId)} (\`${alternate.providerId}\`)`,
            "",
            `Match: ${alternate.artistName ?? "Unknown artist"} — ${alternate.trackName ?? "Unknown track"} · ${alternate.synced ? "synced" : "plain"} · ${alternate.lineCount} lines`,
            "",
            lyricsBlock(text),
          ].join("\n")
        }),
        ...(omittedAlternateCount > 0
          ? [`_(${omittedAlternateCount} more alternate${omittedAlternateCount === 1 ? "" : "s"} omitted — use Re-search diagnostics or paste in Additional details.)_`]
          : []),
      ].join("\n\n")
    : "No alternate lyrics recorded."

  const body = [
    "## Additional details",
    "",
    "<!-- Explain what is wrong: incorrect song, bad transcription, missing lines, timing, etc. -->",
    "",
    "## Track",
    "",
    `- **YouTube Music:** ${youTubeMusicWatchUrl(report.videoId)}`,
    `- **YouTube:** ${youTubeWatchUrl(report.videoId)}`,
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
  return fitIssueUrl(url)
}

function fitIssueUrl(url: URL): string {
  let href = url.toString()
  if (href.length <= MAX_ISSUE_URL_LENGTH) return href

  const body = url.searchParams.get("body") ?? ""
  const withoutAlternates = body.replace(
    /\n## Alternate scraped lyrics[\s\S]*/,
    "\n## Alternate scraped lyrics\n\n_Omitted — issue URL would exceed browser limits. Paste alternates in Additional details if needed._",
  )
  url.searchParams.set("body", withoutAlternates)
  href = url.toString()
  if (href.length <= MAX_ISSUE_URL_LENGTH) return href

  const currentLyricsMarker = "\n## Current lyrics\n\n"
  const currentStart = withoutAlternates.indexOf(currentLyricsMarker)
  if (currentStart >= 0) {
    const nextSection = withoutAlternates.indexOf("\n## ", currentStart + currentLyricsMarker.length)
    const head = withoutAlternates.slice(0, currentStart + currentLyricsMarker.length)
    const tail = nextSection >= 0 ? withoutAlternates.slice(nextSection) : ""
    const shortened = truncateText(
      rawLyricsText(undefined, ["See displayed lyrics in the app — URL trimmed for length."]),
      400,
    )
    url.searchParams.set("body", `${head}${lyricsBlock(shortened)}${tail}`)
  }

  return url.toString()
}
