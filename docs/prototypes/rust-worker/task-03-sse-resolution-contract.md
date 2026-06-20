# Task 03: Versioned SSE Lyrics Resolution Contract

## Status

Contract frozen before implementation.

## Objective

Add an experimental end-to-end lyrics-resolution protocol owned by the Rust
Worker. This task proves request validation, progressive delivery, terminal
result handling, cancellation, and frontend consumption without implementing
metadata search, candidate ranking, or native lyrics resolution.

## Scope

### In scope

- `POST /api/lyrics/resolve` handled by the Rust Worker.
- Version 1 request validation and SSE event envelopes.
- Progressive `phase`, `metadata`, `warning`, and terminal `result` events.
- Stable encoding support for future `candidate` and terminal `error` events.
- A deterministic placeholder result.
- A browser `fetch` plus `ReadableStream` adapter.
- An opt-in player path enabled by `?lyricsResolver=rust` or
  `VITE_RUST_LYRICS_RESOLVER=1`.
- Contract tests for Rust validation, wire encoding, real streaming, and
  frontend parsing.

### Out of scope

- Intelligent metadata resolution.
- Lyrics-provider calls, candidate ranking, translation, romaji, transcription,
  or caching.
- Making the Rust resolver the default.
- Changing the legacy lyrics pipeline.

## Endpoint

`POST /api/lyrics/resolve`

Successful protocol responses, including request-validation failures, use
HTTP 200 with `Content-Type: text/event-stream`. HTTP routing failures that
cannot enter the protocol use ordinary HTTP status codes.

Response headers:

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no`
- `X-Umbra-Origin: rust`
- `X-Umbra-Request-Id: <request ID>`

## Request

```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Optional display title",
  "author": "Optional channel or artist",
  "duration": 212.4,
  "language": "en",
  "forceRefresh": false
}
```

Rules:

- Body must be one JSON object.
- `videoId` is required and must match `[A-Za-z0-9_-]{11}`.
- `title` and `author` are optional trimmed strings, maximum 512 characters.
- `duration` is optional finite seconds in the inclusive range `0..=86400`.
- `language` is an optional trimmed language tag matching
  `[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*`, maximum 64 characters.
- `forceRefresh` is optional and defaults to `false`.
- Unknown fields are rejected to expose client/server drift.
- Request bodies larger than 16 KiB are rejected.

## Event Envelope

Each SSE record has one named event and one single-line JSON `data` value:

```text
event: phase
data: {"protocolVersion":"1","requestId":"...","timestamp":"2026-06-19T12:00:00.000Z","data":{...}}

```

Every event contains:

- `protocolVersion`: literal `"1"`.
- `requestId`: shared with `X-Umbra-Request-Id`.
- `timestamp`: RFC 3339 UTC timestamp.
- `data`: event-specific payload.

Event names and semantics:

- `phase`: current pipeline stage and user-displayable message.
- `metadata`: normalized request metadata accepted by the server.
- `candidate`: one future metadata or lyrics candidate; zero are emitted by
  this task.
- `warning`: non-terminal degradation or prototype limitation.
- `result`: successful terminal result. Exactly one terminal event is emitted.
- `error`: typed terminal failure. Exactly one terminal event is emitted.

Clients must ignore unknown event names and unknown payload fields. Clients
must reject unsupported `protocolVersion` values.

## Task 03 Event Sequence

Valid requests emit, in order:

1. `phase` with `phase: "accepted"`.
2. `metadata` echoing normalized supplied metadata.
3. `phase` with `phase: "resolving"`.
4. `warning` with `code: "placeholder_resolution"`.
5. `result` with deterministic placeholder data.

The placeholder result:

```json
{
  "outcome": "not_found",
  "resolution": "placeholder",
  "videoId": "dQw4w9WgXcQ",
  "metadata": {
    "title": "Optional display title",
    "author": "Optional channel or artist",
    "duration": 212.4,
    "language": "en"
  },
  "lyrics": null
}
```

`forceRefresh` affects later cache work and is accepted but does not alter this
task's deterministic result.

Invalid requests emit one terminal `error` event:

```json
{
  "code": "invalid_request",
  "message": "videoId must be an 11-character YouTube video ID",
  "field": "videoId",
  "retryable": false
}
```

Stable error codes in this task:

- `method_not_allowed`
- `invalid_content_type`
- `body_too_large`
- `invalid_json`
- `invalid_request`
- `internal_error`

## Streaming and Cancellation

Events are produced lazily. The response becomes available after the first
event, while later events remain pending. No detached resolution task is
spawned. Canceling or dropping the response body drops the Rust stream and its
pending delay, so remaining work is canceled.

The first event must be observable before the terminal event. Contract tests
read the first event independently and then consume the remainder.

## Frontend Adapter

`resolveLyricsWithRust`:

- sends the version 1 request with `fetch`;
- incrementally parses SSE records across arbitrary chunk boundaries;
- validates the common envelope;
- reports each non-terminal event through `onEvent`;
- resolves only after a `result` event;
- rejects with a typed error after an `error` event, unsupported protocol
  version, malformed stream, missing terminal event, or HTTP failure;
- accepts an `AbortSignal`.

The player uses the adapter only when `?lyricsResolver=rust` is present or
`VITE_RUST_LYRICS_RESOLVER=1`. The placeholder terminal result maps to the
existing `not_found` UI outcome. Without the switch, legacy behavior remains
unchanged.

## Test Plan

```bash
cargo test --manifest-path rust-worker/Cargo.toml
npm test -- tests/lib/rust-lyrics-resolver.test.ts
npm run test:rust-worker
npm test
npm run build
```

## Acceptance Criteria

- Valid requests stream at least one event before completion.
- All event envelopes include protocol version, request ID, and timestamp.
- Invalid input produces a typed terminal SSE error.
- Disconnecting drops remaining lazy stream work.
- Frontend adapter displays phase messages and consumes a final result behind
  an opt-in switch.
- Wire-format tests cover all six owned event names.

## Implementation Findings

Implemented on 2026-06-19.

- The Rust gateway now owns `/api/lyrics/resolve`; all other `/api/*` routes
  retain legacy forwarding.
- Request validation is performed before stream creation. Invalid methods,
  content types, oversized bodies, malformed JSON, unknown fields, and invalid
  field values return typed terminal SSE errors.
- Valid requests emit five lazy events with a delay between records. The first
  `phase` record reaches the client before the terminal `result`. Because no
  detached task exists, response cancellation drops the stream and pending
  `Delay`, canceling remaining work. Tests cover both browser-side stream
  cancellation and incomplete Rust stream-state drop.
- Task 03 returns a deterministic `not_found` placeholder. It does not call
  providers, metadata services, transcription, or caches.
- The frontend adapter handles arbitrary fetch chunk boundaries and LF/CRLF
  SSE framing, validates protocol envelopes, surfaces non-terminal progress,
  and converts terminal errors into `RustLyricsProtocolError`.
- `?lyricsResolver=rust` and `VITE_RUST_LYRICS_RESOLVER=1` enable the adapter.
  The switch bypasses existing local lyrics cache so each prototype load
  exercises the endpoint. Existing frontend transcription fallback remains
  unchanged because Task 9 owns transcription policy.
- Verification completed:
  - `cargo clippy --manifest-path rust-worker/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path rust-worker/Cargo.toml` — 14 passed
  - `npm run test:rust-worker` — 60 gateway contracts, 10 Rust gateway
    contracts, and the Rust-failure contract passed
  - `npm test` — 875 passed, 29 skipped
  - `npm run build` — web and Rust/Wasm builds passed
- Local gateway smoke retries exposed pre-existing Spotify contract flakes:
  one `/api/auth/spotify/me` timeout and one missing CORS header from
  `/api/auth/spotify/refresh`. A complete rerun passed before the final
  validation-only Rust edits; the final Rust gateway contract then passed
  directly against the rebuilt local multi-Worker gateway.
- Repository-wide `npm run lint` remains red on the documented pre-existing
  Vite+ import and test type-resolution errors. `tsc -b`, Rust clippy, and
  changed-file tests pass.
