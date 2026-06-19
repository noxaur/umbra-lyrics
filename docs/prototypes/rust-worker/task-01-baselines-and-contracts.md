# Task 01: Baselines and API Contracts

## Status

Specification only. This task must not change production runtime behavior.

Task 2 and every later compatibility claim depend on the artifacts produced by
this task.

## Objective

Freeze a versioned, executable description of the current TypeScript Worker and
lyrics pipeline before the Rust prototype changes the public entrypoint.

The result must answer four questions:

1. Which public `/api/*` requests does the current Worker recognize?
2. What response status, headers, body shape, and streaming behavior does each
   request expose?
3. Which lyric-resolution outcomes must both implementations preserve or
   intentionally improve?
4. What are the current end-to-end latency, request count, and success rate on
   the reference corpus?

## Current Evidence

- API dispatch is centralized in `worker/router.ts`.
- Worker-level redirects, static asset fallback, and security headers are in
  `worker/index.ts` and `worker/headers.ts`.
- The six reference tracks are defined in
  `tests/fixtures/reference-tracks.json`.
- Representative pipeline responses are in
  `tests/fixtures/lyrics-pipeline/reference-responses.json`.
- Existing live timing coverage is split between
  `tests/lib/lyrics-search-benchmark.test.ts` and
  `scripts/benchmark-lyrics-browser.mjs`.
- Existing worker tests exercise individual handlers, but there is no single
  route inventory or compatibility suite that can target both Worker
  implementations.

## Caveman Constraint

`caveman` was invoked while preparing this specification, as required by
`AGENTS.md`, but exited before analysis because no model provider or API key was
configured:

```text
No API key found for unknown.
```

Implementation may proceed without Caveman if the same environment constraint
remains. Record any later successful invocation or the unchanged failure in the
implementation findings.

## Scope

### In scope

- Inventory every route recognized by `handleApiRequest`.
- Freeze representative success, validation-error, upstream-error, and
  unavailable-binding responses.
- Freeze Worker-wide CORS, security-header, redirect, asset-fallback, range,
  and streaming expectations needed by Task 2.
- Expand the lyric corpus with multilingual, metadata, source-quality, and
  terminal-outcome cases.
- Provide a target-neutral contract harness that can run against the current
  TypeScript router and a future HTTP endpoint.
- Provide a repeatable browser-level benchmark for the current public
  application.
- Commit one dated baseline result produced by the benchmark.

### Out of scope

- Changing route behavior, response payloads, ranking, provider order, timeout
  policy, caching, or UI behavior.
- Fixing defects found while capturing the baseline.
- Adding Rust, Wasm, Worker service bindings, or the new resolution endpoint.
- Requiring live third-party services for normal test runs.
- Treating unstable upstream payload fields as compatibility requirements.

Defects and unstable behavior found during capture must be documented as
baseline facts or follow-up issues, not repaired in this task.

## Deliverables

Use these paths unless implementation reveals a concrete repository constraint:

```text
tests/fixtures/contracts/api-routes.json
tests/fixtures/contracts/api-responses/
tests/fixtures/lyrics-cases.json
tests/contract/api-contract.test.ts
tests/contract/worker-shell-contract.test.ts
tests/contract/contract-target.ts
scripts/benchmark-legacy-lyrics.mjs
docs/prototypes/rust-worker/baselines/legacy-lyrics-YYYY-MM-DD.json
```

The implementation findings and the exact baseline command must be appended to
this document.

## Frozen Route Inventory

`tests/fixtures/contracts/api-routes.json` is the source of truth for the
compatibility suite. Each entry must include:

- stable route ID;
- exact path or path-prefix pattern;
- currently recognized method or methods;
- required query, path, body, and authorization inputs;
- representative success and failure fixture IDs;
- response class: JSON, text, redirect, stream metadata, or byte stream;
- required headers;
- required environment bindings or credentials;
- whether the route is deterministic under mocked upstreams;
- compatibility level: exact value, body shape, semantic, or smoke-only.

The initial inventory must contain all current route families:

| Group | Routes |
| --- | --- |
| Lyrics | `/api/lyrics/ovh/:artist/:title`, `/api/lyrics/search`, `/api/lyrics/lrc`, `/api/lyrics/megalobiz/search`, `/api/lyrics/chartlyrics/search`, `/api/lyrics/vagalume/search`, `/api/lyrics/genius/search`, `/api/lyrics/lyricstranslate/search`, `/api/lyrics/animelyrics/search`, `/api/lyrics/lyricswiki/search`, `/api/lyrics/songmeanings/search`, `/api/lyrics/petitlyrics/search`, `/api/lyrics/letras/search`, `/api/lyrics/lrclib*`, `/api/lyrics/musicbrainz*`, `/api/lyrics/musixmatch/search`, `POST /api/lyrics/transcribe` |
| Metadata | `/api/metadata/spotify/search`, `/api/metadata/spotify/track`, `/api/metadata/deezer/search`, `/api/metadata/itunes/search` |
| Spotify auth | `/api/auth/spotify/config`, `POST /api/auth/spotify/token`, `POST /api/auth/spotify/refresh`, `/api/auth/spotify/me` |
| YouTube | `/api/youtube/oembed`, `/api/youtube/search`, `/api/youtube/music-search`, `/api/youtube/playlist` |
| YouTube beta | `/api/beta/youtube/stream`, `/api/beta/youtube/proxy`, `/api/beta/youtube/proxy-url` |
| Translation | `POST /api/translate/libretranslate`, `/api/translate/mymemory`, `/api/translate/google` |
| Transliteration | `POST /api/romaji` |

Global `OPTIONS` behavior is a separate inventory entry because the router
accepts it before path matching.

The inventory must be derived from and checked against `worker/router.ts`.
Adding a route without updating the inventory must fail a test. Prefix routes
must include concrete representative subpaths, such as LRCLIB search/get and
MusicBrainz recording lookup.

## Contract Semantics

### Stable assertions

Contract tests must compare:

- status code and redirect location;
- content type and CORS headers;
- HSTS and referrer policy on Worker responses;
- isolation headers on static assets and HTTP redirects;
- JSON field presence, primitive types, nullability, and stable enum values;
- validation and missing-binding error classification;
- byte-stream status and range headers;
- response bodies for deterministic locally mocked cases;
- passthrough of `Authorization`, `Range`, and relevant content headers.

### Deliberately unstable assertions

Tests must not freeze:

- upstream ordering unless the application currently assigns semantic meaning
  to it;
- provider-generated IDs, URLs, timestamps, tokens, or error prose;
- exact latency;
- complete third-party response bodies;
- headers injected by deployment infrastructure rather than application code.

Normalize or mask unstable fields before snapshot comparison. Prefer explicit
schema assertions over broad snapshots.

### Unsupported requests

The suite must record current behavior for:

- an unknown `/api/*` path;
- a recognized POST-only path called with `GET`;
- malformed JSON on JSON POST routes;
- missing required query/path values;
- a non-API asset path;
- `http:` API and non-API requests.

This is important because `handleApiRequest` currently returns `null` for some
method mismatches, allowing the Worker shell to fall through to assets.

## Contract Harness

Define a minimal target interface in `tests/contract/contract-target.ts`:

```ts
export interface ContractTarget {
  name: string
  request(request: Request): Promise<Response>
}
```

Provide:

- an in-process legacy target backed by the TypeScript Worker with mocked
  bindings and upstream `fetch`;
- an HTTP target selected by `CONTRACT_BASE_URL`, for the future Rust gateway
  or a deployed legacy Worker.

Deterministic contract tests run against the in-process target in normal CI.
HTTP compatibility runs are opt-in and execute the same cases without relying
on implementation internals. Task 2 must be able to add a Rust target without
rewriting case definitions.

Provider-specific parsing tests remain in their existing files. This suite
owns only public boundary behavior.

## Lyrics Fixture Corpus

Keep the existing six reference tracks unchanged:

| Video ID | Track | Language |
| --- | --- | --- |
| `Ktk_EDLDPeY` | 天音かなた — 別世界 | Japanese |
| `fJ9rUzIMcZQ` | Queen — Bohemian Rhapsody | English |
| `kXYiU_JCYtU` | Linkin Park — Numb | English |
| `kJQP7kiw5Fk` | Luis Fonsi — Despacito | Spanish |
| `9bZkp7q19f0` | PSY — Gangnam Style | Korean |
| `dQw4w9WgXcQ` | Rick Astley — Never Gonna Give You Up | English |

Add cases covering every required failure class:

- unavailable or invalid YouTube video;
- misleading YouTube title/author that requires corrected metadata;
- valid track with no lyrics result;
- instrumental track;
- scraper HTML, snippets, entities, or navigation junk;
- non-English native lyrics preserved as non-English output.

Each case must declare:

- case ID and category;
- video ID or synthetic input;
- supplied title, author, duration, and language when relevant;
- expected terminal outcome;
- minimum lyric quality assertions such as language, synchronization state,
  line count, required short needles, and forbidden junk markers;
- whether it is deterministic, live-only, or both;
- provenance and capture date for recorded upstream fixtures.

Do not store full copyrighted lyrics when a short excerpt, structural fixture,
or hash is sufficient. Existing quality fixtures under
`tests/fixtures/lyrics-quality/` should be reused.

## Benchmark

`scripts/benchmark-legacy-lyrics.mjs` must benchmark the user-visible lyrics
path through a browser, not only an internal scoring function.

### Inputs

- Base URL from `BENCHMARK_BASE_URL`, defaulting to
  `https://song.opsec.rent`.
- All six reference tracks plus the deterministic failure cases that can run
  through the deployed application.
- A documented run count, defaulting to three measured runs per case.
- A fresh browser context per measured run. Local application lyrics caches
  must be empty. Any server-side or third-party cache state is observed and
  reported, not assumed controllable.

### Measurements

For each run record:

- UTC timestamp, base URL, git commit, browser version, and corpus version;
- video ID and case ID;
- wall time from navigation start to terminal lyrics state;
- terminal state: found, not found, instrumental, error, or timeout;
- native language and synchronized/plain result when observable;
- rendered lyric line count;
- total `/api/*` calls and calls grouped by route;
- status code and duration for each API call;
- whether fixture quality assertions passed;
- timeout or browser error details.

The aggregate must report success count/rate, median and p95 wall time, median
API-call count, and per-case results. A failure result is successful when it
reaches its expected typed terminal state rather than timing out or displaying
incorrect lyrics.

The script exits non-zero for an unexpected terminal state, failed quality
assertion, malformed output, or zero successful reference tracks. It writes
machine-readable JSON to a caller-provided path and prints a concise table.

### Recorded baseline

Run the benchmark against the current public legacy Worker and commit the raw
JSON result under `baselines/`. Record the exact command and a short summary
here. Baseline numbers are evidence, not pass/fail thresholds for later tasks;
the environment and sample size must remain visible beside the measurements.

## Test Plan

Normal CI:

```bash
npm test -- tests/contract tests/integration/reference-tracks.live.test.ts
```

The reference-track fixture assertions must run without network access. Live
checks remain opt-in:

```bash
RUN_LIVE_LYRICS=1 LYRICS_API_BASE=<legacy-base> npm test -- \
  tests/integration/reference-tracks.live.test.ts \
  tests/lib/lyrics-search-benchmark.test.ts
```

HTTP contract compatibility must also be opt-in:

```bash
CONTRACT_BASE_URL=<worker-base> npm test -- tests/contract
```

Run the full suite and build before completion:

```bash
npm test
npm run build
```

## Acceptance Criteria

- A checked-in route inventory covers all 36 current API route families and
  global `OPTIONS`.
- A test fails when router coverage and the inventory diverge.
- Every route has at least one contract or smoke case and an explicit
  compatibility level.
- The same contract case definitions can target the in-process TypeScript
  Worker and an HTTP Worker.
- Worker-wide redirects, security headers, asset fallback, streaming, and
  range forwarding expectations are executable.
- The original six reference tracks remain present and unchanged.
- The corpus covers unavailable video, wrong metadata, no lyrics,
  instrumental content, scraper junk, and non-English output.
- Normal tests are deterministic and do not require provider credentials or
  network access.
- The benchmark is repeatable, machine-readable, and captures latency, API
  calls, terminal outcome, and lyric quality.
- A dated legacy baseline result and exact reproduction command are committed.
- Runtime behavior is unchanged.

## Implementation Findings

Implemented on 2026-06-19.

- The final artifacts use the paths proposed in this specification. Benchmark
  aggregation is isolated in `scripts/benchmark-legacy-lyrics-lib.mjs` so its
  percentile and terminal-state rules can be tested without a browser.
- The frozen inventory contains 36 API route families plus global `OPTIONS`.
  A source-to-inventory test extracts route literals from `worker/router.ts`,
  so adding or removing a route without updating the inventory fails.
- The contract target seam has legacy TypeScript and HTTP adapters. Setting
  `CONTRACT_BASE_URL` runs the same route and validation cases against a
  deployed Worker.
- Current method mismatch behavior is surprising but preserved: calling a
  POST-only path with `GET` falls through to static assets. Unknown `/api/*`
  paths do the same at the Worker shell.
- Contract assertions normalize provider payloads to status, headers, stable
  validation bodies, primitive response shape, and stream metadata. Provider
  IDs, URLs, tokens, timings, and complete third-party payloads are not frozen.
- The original six tracks remain unchanged. `lyrics-cases.json` adds explicit
  unavailable-video, wrong-metadata, no-lyrics, instrumental, scraper-junk,
  and non-English-output cases. Existing reported-track and scraper-quality
  fixtures are referenced where available; synthetic cases are labeled.
- Caveman was retried during implementation and remained unavailable because
  no model provider or API key was configured.
- Dependency installation required `npm install --ignore-scripts` because the
  unrelated `onnxruntime-node` install script failed while downloading a
  native binary after detecting unsupported CUDA 13.
- Baseline command:

  ```bash
  npm run benchmark:legacy-lyrics -- --runs 1 --timeout-ms 20000 \
    --output docs/prototypes/rust-worker/baselines/legacy-lyrics-2026-06-19.json
  ```

- The baseline used headless Chrome against `https://song.opsec.rent`. All six
  reference tracks timed out at approximately 20.4–20.8 seconds because the
  YouTube player remained at “Loading track… / Preparing player…” in this
  environment. API-call counts were still captured: 11, 12, 7, 17, 17, and 6.
  The three runnable synthetic failure cases completed in 282–325 ms; only the
  unavailable-video case reached its expected `error` state, while the
  no-lyrics and instrumental fixtures currently collapse to the same generic
  error. The aggregate baseline is 1/9 expected outcomes, median 20,550 ms,
  p95 20,754 ms, and median 7 API calls. The older
  `scripts/benchmark-lyrics-browser.mjs` reproduced the same player
  initialization failure. The raw result is committed as evidence rather than
  inventing successful latency data.
- No runtime defect was fixed in this task. Headless player initialization and
  the POST-method asset fallback are deferred findings.
