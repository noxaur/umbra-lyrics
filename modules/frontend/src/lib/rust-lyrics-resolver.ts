import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"
import type { TranslationBackend } from "@/lib/translation-service"

export const RUST_LYRICS_PROTOCOL_VERSION = "1"

export type RustLyricsResolveRequest = {
  videoId: string
  title?: string
  author?: string
  duration?: number
  language?: string
  forceRefresh?: boolean
}

export type RustLyricsEventName =
  | "phase"
  | "metadata"
  | "candidate"
  | "warning"
  | "result"
  | "error"

export type RustLyricsLine = {
  startMs: number
  endMs: number
  text: string
  approximate: boolean
  kind?: "lyric" | "section"
}

export type RustLyricsScoringReason = {
  code: string
  points: number
}

export type RustLyricsSelected = {
  id: string | number | null
  providerId: string | null
  artist: string | null
  track: string | null
  duration: number | null
  plainLyrics: string | null
  syncedLyrics: string | null
  synced: boolean
  approximateTiming: boolean
  lines: RustLyricsLine[]
  score: number | null
  confidence: number | null
  scoringReasons: RustLyricsScoringReason[]
}

export type RustLyricsAlternate = {
  providerId: string
  id: string | number
  trackName: string
  artistName: string
  synced: boolean
  lineCount: number
  rankScore: number
  lyricsResult: {
    id: string | number
    providerId: string
    plainLyrics: string | null
    syncedLyrics: string | null
    synced: boolean
  }
}

export type RustLyricsEvent<T = Record<string, unknown>> = {
  event: RustLyricsEventName
  protocolVersion: typeof RUST_LYRICS_PROTOCOL_VERSION
  requestId: string
  timestamp: string
  data: T
}

export type RustLyricsEnglish = {
  status: "ready" | "skipped" | "failed"
  source?: "found" | "translated" | null
  providerId?: string | null
  translationBackend?: TranslationBackend | null
  alignment?: "aligned" | "degraded" | "skipped"
  lines?: string[]
}

export type RustLyricsRomaji = {
  status: "ready" | "skipped" | "unsupported"
  system?: string | null
  reason?: string | null
  lines?: string[]
}

export type RustLyricsResult = {
  outcome: "found" | "instrumental" | "low_confidence" | "not_found"
  resolution: "native"
  videoId: string
  metadata: {
    title: string | null
    author: string | null
    duration: number | null
    language: string | null
  }
  lyrics: RustLyricsSelected | null
  alternates: RustLyricsAlternate[]
  message: string
  english?: RustLyricsEnglish
  romaji?: RustLyricsRomaji
}

export type RustLyricsProtocolErrorData = {
  code: string
  message: string
  field: string | null
  retryable: boolean
}

export class RustLyricsProtocolError extends Error {
  readonly code: string
  readonly field: string | null
  readonly retryable: boolean

  constructor(data: RustLyricsProtocolErrorData) {
    super(data.message)
    this.name = "RustLyricsProtocolError"
    this.code = data.code
    this.field = data.field
    this.retryable = data.retryable
  }
}

type ResolveOptions = {
  signal?: AbortSignal
  onEvent?: (event: RustLyricsEvent) => void
  fetchImpl?: typeof fetch
}

export async function resolveLyricsWithRust(
  request: RustLyricsResolveRequest,
  options: ResolveOptions = {},
): Promise<RustLyricsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${lyricsApiBase()}/api/lyrics/resolve`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(`Rust lyrics resolver returned HTTP ${response.status}`)
  }
  if (!response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")) {
    throw new Error("Rust lyrics resolver returned a non-SSE response")
  }
  if (!response.body) {
    throw new Error("Rust lyrics resolver returned no response body")
  }

  const reader = response.body.getReader()
  const expectedRequestId = response.headers.get("X-Umbra-Request-Id")
  if (!expectedRequestId) {
    throw new Error("Rust lyrics resolver response omitted its request ID")
  }
  const decoder = new TextDecoder()
  let buffer = ""
  let result: RustLyricsResult | undefined
  let terminalSeen = false

  const consumeRecord = (record: string) => {
    const event = parseSseRecord(record)
    if (!event) return
    if (event.requestId !== expectedRequestId) {
      throw new Error("Rust lyrics resolver event request ID did not match response")
    }
    if (terminalSeen) {
      throw new Error("Rust lyrics resolver emitted events after its terminal event")
    }
    if (event.event === "error") {
      terminalSeen = true
      throw new RustLyricsProtocolError(parseErrorData(event.data))
    }
    if (event.event === "result") {
      options.onEvent?.(event)
      terminalSeen = true
      result = parseResultData(event.data)
    } else {
      options.onEvent?.(event)
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let boundary = findRecordBoundary(buffer)
    while (boundary) {
      consumeRecord(buffer.slice(0, boundary.index))
      buffer = buffer.slice(boundary.index + boundary.length)
      boundary = findRecordBoundary(buffer)
    }
    if (done) break
  }

  if (buffer.trim()) consumeRecord(buffer)
  if (!result) {
    throw new Error("Rust lyrics resolver stream ended without a result")
  }
  return result
}

function parseSseRecord(record: string): RustLyricsEvent | null {
  let eventName: string | undefined
  const dataLines: string[] = []
  let hasMeaningfulLine = false

  for (const line of record.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue
    hasMeaningfulLine = true
    if (line.startsWith("event:")) eventName = line.slice(6).trim()
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
  }

  if (!hasMeaningfulLine) return null
  if (!eventName || dataLines.length === 0) {
    throw new Error("Rust lyrics resolver emitted a malformed SSE record")
  }
  if (!isEventName(eventName)) return null

  let envelope: unknown
  try {
    envelope = JSON.parse(dataLines.join("\n"))
  } catch {
    throw new Error("Rust lyrics resolver emitted invalid JSON")
  }
  if (!isRecord(envelope)) {
    throw new Error("Rust lyrics resolver emitted an invalid event envelope")
  }
  if (envelope.protocolVersion !== RUST_LYRICS_PROTOCOL_VERSION) {
    throw new Error(`Unsupported Rust lyrics protocol version: ${String(envelope.protocolVersion)}`)
  }
  if (
    typeof envelope.requestId !== "string" ||
    !envelope.requestId ||
    typeof envelope.timestamp !== "string" ||
    !isUtcRfc3339(envelope.timestamp) ||
    !isRecord(envelope.data)
  ) {
    throw new Error("Rust lyrics resolver emitted an invalid event envelope")
  }

  return {
    event: eventName,
    protocolVersion: RUST_LYRICS_PROTOCOL_VERSION,
    requestId: envelope.requestId,
    timestamp: envelope.timestamp,
    data: envelope.data,
  }
}

function parseResultData(data: Record<string, unknown>): RustLyricsResult {
  if (
    !["found", "instrumental", "low_confidence", "not_found"].includes(String(data.outcome)) ||
    data.resolution !== "native" ||
    typeof data.videoId !== "string" ||
    !isRecord(data.metadata) ||
    typeof data.message !== "string"
  ) {
    throw new Error("Rust lyrics resolver emitted an invalid result")
  }

  const english = isRecord(data.english)
    ? {
        status: ["ready", "skipped", "failed"].includes(String(data.english.status))
          ? (data.english.status as RustLyricsEnglish["status"])
          : "failed",
        source:
          data.english.source === "found" || data.english.source === "translated"
            ? (data.english.source as "found" | "translated")
            : null,
        providerId: optionalStringOrNull(data.english.providerId),
        translationBackend: optionalTranslationBackend(data.english.translationBackend),
        alignment:
          data.english.alignment === "aligned" ||
          data.english.alignment === "degraded" ||
          data.english.alignment === "skipped"
            ? (data.english.alignment as "aligned" | "degraded" | "skipped")
            : undefined,
        lines: Array.isArray(data.english.lines)
          ? data.english.lines.filter((line): line is string => typeof line === "string")
          : undefined,
      }
    : undefined

  const romaji = isRecord(data.romaji)
    ? {
        status:
          data.romaji.status === "ready" ||
          data.romaji.status === "skipped" ||
          data.romaji.status === "unsupported"
            ? (data.romaji.status as RustLyricsRomaji["status"])
            : "skipped",
        system: optionalStringOrNull(data.romaji.system),
        reason: optionalStringOrNull(data.romaji.reason),
        lines: Array.isArray(data.romaji.lines)
          ? data.romaji.lines.filter((line): line is string => typeof line === "string")
          : undefined,
      }
    : undefined

  return {
    outcome: data.outcome as RustLyricsResult["outcome"],
    resolution: "native",
    videoId: data.videoId,
    metadata: {
      title: optionalString(data.metadata.title),
      author: optionalString(data.metadata.author),
      duration: optionalNumber(data.metadata.duration),
      language: optionalString(data.metadata.language),
    },
    lyrics: parseOptionalRustLyricsSelected(data.lyrics),
    alternates: Array.isArray(data.alternates)
      ? data.alternates.filter(isRecord).map(parseRustLyricsAlternate)
      : [],
    message: data.message,
    english,
    romaji,
  }
}

function parseRustLyricsSelected(data: Record<string, unknown>): RustLyricsSelected {
  if (!isRecord(data) || !Array.isArray(data.lines) || !Array.isArray(data.scoringReasons)) {
    throw new Error("Rust lyrics resolver emitted an invalid native lyrics payload")
  }
  return {
    id: optionalId(data.id),
    providerId: optionalString(data.providerId),
    artist: optionalString(data.artist),
    track: optionalString(data.track),
    duration: optionalNumber(data.duration),
    plainLyrics: optionalStringOrNull(data.plainLyrics),
    syncedLyrics: optionalStringOrNull(data.syncedLyrics),
    synced: Boolean(data.synced),
    approximateTiming: Boolean(data.approximateTiming),
    lines: data.lines.filter(isRecord).map((line) => ({
      startMs: optionalNumber(line.startMs) ?? 0,
      endMs: optionalNumber(line.endMs) ?? 0,
      text: optionalString(line.text) ?? "",
      approximate: Boolean(line.approximate),
      kind: line.kind === "section" ? "section" : "lyric",
    })),
    score: optionalNumberOrNull(data.score),
    confidence: optionalNumberOrNull(data.confidence),
    scoringReasons: data.scoringReasons.filter(isRecord).map((reason) => ({
      code: optionalString(reason.code) ?? "",
      points: optionalNumber(reason.points) ?? 0,
    })),
  }
}

function parseOptionalRustLyricsSelected(data: unknown): RustLyricsSelected | null {
  if (data === null) return null
  if (!isRecord(data)) {
    throw new Error("Rust lyrics resolver emitted an invalid native lyrics payload")
  }
  return parseRustLyricsSelected(data)
}

function parseRustLyricsAlternate(data: Record<string, unknown>): RustLyricsAlternate {
  if (
    !isRecord(data) ||
    typeof data.providerId !== "string" ||
    typeof data.trackName !== "string" ||
    typeof data.artistName !== "string" ||
    !isRecord(data.lyricsResult)
  ) {
    throw new Error("Rust lyrics resolver emitted an invalid native alternate payload")
  }
  return {
    providerId: data.providerId,
    id: requiredId(data.id),
    trackName: data.trackName,
    artistName: data.artistName,
    synced: Boolean(data.synced),
    lineCount: optionalNumber(data.lineCount) ?? 0,
    rankScore: optionalNumber(data.rankScore) ?? 0,
    lyricsResult: {
      id: requiredId(data.lyricsResult.id),
      providerId: optionalString(data.lyricsResult.providerId) ?? data.providerId,
      plainLyrics: optionalStringOrNull(data.lyricsResult.plainLyrics),
      syncedLyrics: optionalStringOrNull(data.lyricsResult.syncedLyrics),
      synced: Boolean(data.lyricsResult.synced),
    },
  }
}

const TRANSLATION_BACKENDS = new Set<TranslationBackend>([
  "browser",
  "google",
  "mymemory",
  "libretranslate",
])

function optionalTranslationBackend(value: unknown): TranslationBackend | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    throw new Error("Rust lyrics resolver emitted invalid native lyrics")
  }
  if (!TRANSLATION_BACKENDS.has(value as TranslationBackend)) {
    throw new Error("Rust lyrics resolver emitted invalid native lyrics")
  }
  return value as TranslationBackend
}

function parseErrorData(data: Record<string, unknown>): RustLyricsProtocolErrorData {
  if (
    typeof data.code !== "string" ||
    typeof data.message !== "string" ||
    (data.field !== null && typeof data.field !== "string") ||
    typeof data.retryable !== "boolean"
  ) {
    throw new Error("Rust lyrics resolver emitted an invalid error")
  }
  return {
    code: data.code,
    message: data.message,
    field: data.field,
    retryable: data.retryable,
  }
}

function optionalString(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === "string") return value
  throw new Error("Rust lyrics resolver emitted invalid metadata")
}

function optionalStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  throw new Error("Rust lyrics resolver emitted invalid native lyrics")
}

function optionalNumber(value: unknown): number | null {
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new Error("Rust lyrics resolver emitted invalid metadata")
}

function optionalNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new Error("Rust lyrics resolver emitted invalid native lyrics")
}

function optionalId(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string" || typeof value === "number") return value
  throw new Error("Rust lyrics resolver emitted invalid native id")
}

function requiredId(value: unknown): string | number {
  const id = optionalId(value)
  if (id === null) {
    throw new Error("Rust lyrics resolver emitted invalid native id")
  }
  return id
}

function isEventName(value: string): value is RustLyricsEventName {
  return ["phase", "metadata", "candidate", "warning", "result", "error"].includes(value)
}

function isUtcRfc3339(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  )
}

function findRecordBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n")
  const crlf = buffer.indexOf("\r\n\r\n")
  if (lf < 0 && crlf < 0) return null
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return { index: crlf, length: 4 }
  return { index: lf, length: 2 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
