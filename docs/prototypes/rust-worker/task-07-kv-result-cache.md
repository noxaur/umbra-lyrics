# Task 07: Versioned KV Result Cache

## Status

Spec written before implementation.

## Objective

Add a KV-backed cache around the complete Rust lyrics-resolution operation
without tying cache behavior to provider internals. The cache must preserve the
existing Task 03/04 SSE contract, avoid stale or corrupt reuse, and keep
concurrent requests from stampeding the same key.

## Scope

### In scope

- Cache lookup and writeback for `/api/lyrics/resolve`.
- Cache keys that include the YouTube video ID and a pipeline-version component.
- Distinct TTL policies for successful, negative, and transient results.
- `forceRefresh` bypassing cache reads while still allowing eligible writes.
- Cache-hit replay that still emits normal SSE progress and terminal events.
- Safe ignore of corrupt, missing, or outdated KV entries.
- Concurrency handling that avoids obvious duplicate writes for the same key.
- Tests using mocked KV behavior, not a real Cloudflare deployment.

### Out of scope

- Changing provider ranking, metadata resolution, or lyrics-source policy.
- Introducing a new wire event or changing the Task 03 protocol envelope.
- Frontend cutover, transcription, translation, or romaji work.

## Cache Contract

The cache stores a serialized resolution snapshot keyed by:

- `videoId`
- pipeline version

The key format should be deterministic and easy to invalidate by version bump.
The exact string is an implementation detail, but it must embed the version
namespace so future protocol changes do not reuse incompatible entries.

Entries carry their own schema version. A cache hit is only valid when:

- the stored schema version matches;
- the pipeline version matches the current resolver version;
- the `videoId` matches the request;
- the entry deserializes cleanly;
- the entry class is not expired by policy.

## TTL Policy

Use three buckets:

- successful final results: longest TTL;
- negative/not-found final results: shorter TTL;
- transient failures or partial fallback outcomes: shortest TTL.

The task should make the bucket choice explicit in code so future tasks can
adjust policy without rewriting cache plumbing.

## Request Semantics

- `forceRefresh: true` skips KV reads.
- `forceRefresh` does not block writeback when the request finishes with an
  eligible terminal state.
- On cache hit, the resolver still streams the same accepted/progress/final
  SSE shape that the live path uses.
- Corrupt or outdated entries are treated as misses and should not surface to
  the client.

## Concurrency Semantics

Two or more requests for the same cache key may overlap. The implementation
should:

- avoid unnecessary duplicate writes when a winner already populated the KV
  entry;
- remain correct if multiple requests race and one overwrites the other with an
  equivalent snapshot;
- prefer simple, observable behavior over distributed-lock complexity.

## Implementation Plan

1. Add a cache snapshot model for the completed resolution result.
2. Introduce a small cache facade around KV get/put and TTL selection.
3. Integrate the facade into the resolution stream without changing protocol
   envelopes.
4. Add mocked-KV unit tests for hits, misses, force refresh, stale entries,
   corrupt entries, and race conditions.
5. Wire the root worker config to expose the KV binding.

## Test Plan

- cache hit replays a valid SSE stream without recomputing the live path;
- `forceRefresh` bypasses reads;
- successful, negative, and transient outcomes choose distinct TTLs;
- stale schema or version mismatches are ignored;
- malformed JSON or missing fields in KV are ignored safely;
- concurrent duplicate requests do not produce multiple observable writes for
  the same fresh result;
- the existing Task 03/04 contract tests continue passing.

## Findings

Implemented on 2026-06-20.

- Rust now wraps `/api/lyrics/resolve` with a versioned KV replay cache keyed
  by video ID plus a cache-version namespace.
- Cache entries store the post-accepted SSE event sequence, so a hit replays
  the normal `metadata` / `warning` / `result` flow without touching provider
  work.
- Distinct TTL buckets exist for successful, negative, and transient terminal
  outcomes.
- `forceRefresh` skips reads and still writes eligible results.
- Corrupt, empty, stale-version, and nonterminal entries are treated as misses.
- Duplicate write suppression is done with a read-before-put check for the
  common case; the cache tests cover both sequential and concurrent calls.
- Verification:
  - `cargo fmt --manifest-path rust-worker/Cargo.toml --all --check`
  - `cargo test --manifest-path rust-worker/Cargo.toml result_cache --lib`
    could not finish here because the VM lacks `link.exe`
    (`x86_64-pc-windows-msvc` toolchain linker).
