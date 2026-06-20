# Task 05: Trusted Lyrics Source Cascade

## Status

Specification and implementation findings.

## Objective

Replace broad, uncontrolled lyrics fan-out with one trusted staged cascade:

1. LRCLIB exact lookup
2. LRCLIB variant lookup
3. lyrics.ovh
4. Genius scraping

The task owns source ordering, candidate normalization, source failure
classification, timeout handling, and junk rejection. It does not own final
lyrics ranking or native line construction; Task 06 uses the shared candidate
model produced here.

## Scope

### In scope

- A single staged cascade for trusted lyrics sources.
- A shared lyrics candidate model that every source normalizes into.
- Strong synced LRCLIB exact matches short-circuit later fallback work.
- LRCLIB variant search only runs after exact search fails to produce a
  strong synced hit.
- lyrics.ovh and Genius only run after LRCLIB stages fail to yield a strong
  synced result.
- Per-source timeout, HTTP, transport, empty-response, invalid-response, and
  junk classifications.
- Rejection of HTML snippets, contributor chrome, embedded scripts, empty
  bodies, and scraper noise.
- Tests for source order, short-circuiting, timeout/failure classification,
  and junk rejection.

### Out of scope

- Candidate ranking across providers.
- Final native lyrics synthesis.
- English translation, romaji, transcription, or caching.
- Adding any provider beyond LRCLIB, lyrics.ovh, and Genius.
- Broad parallel fan-out or speculative search beyond the staged cascade.

## Provider Policy

The cascade is intentionally narrow.

1. LRCLIB exact lookup uses the selected canonical artist/title directly.
2. If exact LRCLIB returns a strong synced hit, the cascade stops.
3. LRCLIB variant lookup may retry sanitized artist/title variants when exact
   lookup is weak or empty.
4. lyrics.ovh runs only after LRCLIB stages do not produce a strong synced hit.
5. Genius runs last and its HTML output is sanitized before acceptance.

Each provider returns zero or more normalized candidates with:

- `source`
- `sourceId`
- `artist`
- `track`
- `plainLyrics`
- `syncedLyrics`
- `synced`
- `diagnostics`

The candidate shape is shared across all sources so later tasks can rank
results without special-casing provider payloads.

## Timeout and Failure Policy

Each source call is bounded by a per-source timeout.

Timeouts and failures are not terminal pipeline failures. They become
structured source diagnostics so later tasks can continue to reason about the
available candidate pool.

Classifications must distinguish at least:

- timeout
- transport failure
- HTTP failure
- invalid JSON / invalid payload
- empty result
- junk / snippet / HTML rejection

## Junk Rejection Policy

Accepted lyric text must be real lyric content, not provider chrome.

Reject:

- HTML snippets that are not lyric containers;
- Genius description pages and contributor chrome;
- `document.write` / embedded script noise;
- empty or whitespace-only responses;
- snippet-like fragments that do not resemble complete lyrics.

The parser keeps the rejection rules conservative so the cascade prefers no
result over bad result.

## Test Plan

- exact LRCLIB strong sync short-circuits variant, lyrics.ovh, and Genius;
- exact → variant → lyrics.ovh → Genius order remains stable;
- source timeout and failure classifications are preserved in diagnostics;
- Genius HTML lyric containers are accepted;
- Genius description pages and scraper junk are rejected;
- empty lyrics.ovh responses are rejected;
- shared candidate serialization includes source, metadata, lyrics, sync
  state, and diagnostics.

## Findings

Implemented on 2026-06-20.

- The Rust worker now owns a staged trusted lyrics cascade instead of broad
  fan-out. Exact LRCLIB search runs first, variant LRCLIB search runs only
  when exact search is not definitive, and lyrics.ovh then Genius follow as
  ordered fallbacks.
- The cascade normalizes every source into one shared candidate model with
  source, sourceId, metadata, lyric text, sync state, and diagnostics. That
  shape is what later ranking work consumes.
- Strong synced LRCLIB exact matches short-circuit later fallback work. The
  test suite covers both the short-circuit and the fallback order.
- Provider failures are classified rather than collapsed into one generic
  error. Timeouts, transport failures, HTTP failures, invalid payloads, empty
  responses, and junk rejections are all surfaced in diagnostics.
- Genius HTML container parsing accepts real lyric containers and rejects
  description pages and scraper noise. lyrics.ovh empty responses are also
  rejected.
- Verification completed:
  - `cargo fmt --all --manifest-path rust-worker/Cargo.toml`
  - `cargo test --manifest-path rust-worker/Cargo.toml` blocked by missing
    Windows linker toolchain (`link.exe`, then `kernel32.lib` when forcing
    `rust-lld`).
