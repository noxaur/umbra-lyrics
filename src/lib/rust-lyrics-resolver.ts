import { lyricsApiBase } from "@/lib/lyrics-providers/api-base"

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

export type RustLyricsEvent<T = Record<string, unknown>> = {
  event: RustLyricsEventName
  protocolVersion: typeof RUST_LYRICS_PROTOCOL_VERSION
  requestId: string
  timestamp: string
  data: T
}

export type RustLyricsResult = {
  outcome: "not_found"
  resolution: "placeholder"
  videoId: string
  metadata: {
    title: string | null
    author: string | null
    duration: number | null
    language: string | null
  }
  lyrics: null
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
    data.outcome !== "not_found" ||
    data.resolution !== "placeholder" ||
    typeof data.videoId !== "string" ||
    !isRecord(data.metadata) ||
    data.lyrics !== null
  ) {
    throw new Error("Rust lyrics resolver emitted an invalid result")
  }

  return {
    outcome: "not_found",
    resolution: "placeholder",
    videoId: data.videoId,
    metadata: {
      title: optionalString(data.metadata.title),
      author: optionalString(data.metadata.author),
      duration: optionalNumber(data.metadata.duration),
      language: optionalString(data.metadata.language),
    },
    lyrics: null,
  }
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

function optionalNumber(value: unknown): number | null {
  if (value === null) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new Error("Rust lyrics resolver emitted invalid metadata")
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
