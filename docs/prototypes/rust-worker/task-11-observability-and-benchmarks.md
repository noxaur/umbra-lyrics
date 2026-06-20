# Task 11: Observability and Benchmark Comparison

## Status

Specification only. This task must not change lyrics content, audio URLs, or
visible player behavior.

## Objective

Make the Rust SSE prototype explainable without a separate analytics stack, and
give the repo one repeatable way to compare the legacy and Rust paths on the
same fixture set.

The result must answer five questions:

1. What request, phase, cache, source, and fallback state did each resolution
   pass through?
2. Which source won, which sources failed, and which fallback path was used?
3. Did logging ever endanger or block lyrics resolution?
4. How do legacy and Rust runs compare on the same fixtures?
5. Which runs were cache hits, cache misses, or cache-disabled?

## Scope

### In scope

- Structured Rust-side observability for the `/api/lyrics/resolve` SSE path.
- Structured gateway logs for legacy-adapter use in the Rust public Worker.
- A safe logging path that never exposes lyrics text or audio URLs.
- A comparison benchmark that can run the same corpus against legacy and Rust
  paths and report the same core metrics for both.
- Tests for logging redaction and fail-safe behavior.

### Out of scope

- Changing lyric ranking, provider order, cache policy, or response shape.
- Logging full lyric payloads, audio URLs, or third-party response bodies.
- Adding production analytics, tracing SaaS, or external observability infra.
- Reworking the frontend player beyond what the benchmark needs to read.

## Design

### Structured logs

Rust logging must emit small JSON records with:

- `requestId`;
- phase name;
- phase timing deltas;
- cache status and cache latency;
- selected source;
- source outcomes and warning codes;
- transcription call count;
- legacy-adapter use;
- failure category when the run ends badly.

Logs must not include:

- lyric text;
- synced lyric payloads;
- audio URLs;
- upstream response bodies;
- provider tokens or request secrets.

Logging must be best effort. Any serialization or sink failure is swallowed and
resolution continues.

### Comparison harness

The benchmark side must run identical fixtures against both paths:

- legacy path: the current browser-backed player flow;
- Rust path: the SSE resolver path with the Rust `lyricsResolver=rust` mode.

Each run should report, at minimum:

- time to first observable event;
- final latency;
- request count;
- selected source;
- cache latency;
- failure category;
- case ID and video ID;
- terminal result.

The harness should keep legacy and Rust metrics side by side in one machine-
readable JSON report and print a compact table.

## Test Plan

Focused checks:

```bash
npm test -- tests/contract tests/scripts/benchmark-*.test.ts
```

Rust checks:

```bash
cargo test --manifest-path rust-worker/Cargo.toml
```

Full checks before finish:

```bash
npm test
npm run build
```

## Acceptance Criteria

- Rust emits structured JSON logs for resolution phases, cache, source
  outcomes, and fallback state.
- Lyrics text and audio URLs never appear in logs.
- Logging errors do not fail resolution.
- Legacy-adapter use is visible in gateway observability.
- A comparison benchmark runs the same fixture corpus against legacy and Rust
  paths.
- Comparison output includes time to first event, final latency, request count,
  selected source, cache latency, and failure category.
- Tests cover redaction and logging fail-safe behavior.
- Runtime behavior visible to the player remains unchanged.

## Implementation Findings

Implemented on 2026-06-20.

- Rust now emits structured best-effort JSON logs for accepted requests,
  cache lookups, cache hits and misses, metadata resolution, lyrics
  resolution, gateway legacy-adapter use, and typed terminal failures.
- The observability payload keeps only counts, source labels, timings, and
  failure categories. It does not serialize lyric text, synced lyrics, or
  audio URLs.
- Logging is fail-safe. Serialization errors are swallowed, and the
  resolution path still returns its SSE response.
- The new Rust benchmark script measures the same fixture corpus through the
  `/api/lyrics/resolve` SSE path and records first-event latency, final
  latency, request count, selected source, cache latency, and failure
  category.
- The comparison harness runs both benchmark scripts and emits a single JSON
  report with legacy, Rust, and delta summaries.
- Verification completed:
  - `npm test -- tests/scripts/benchmark-legacy-lyrics.test.ts tests/scripts/benchmark-rust-lyrics.test.ts`
  - `npm test -- tests/contract tests/scripts/benchmark-*.test.ts`
  - `npm test`
  - `npm run build:web`
- Rust-side `cargo test --manifest-path rust-worker/Cargo.toml` could not run
  in this VM because the installed MSVC toolchain is missing `link.exe`.
  That is an environment limit, not a repo regression.
