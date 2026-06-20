# Task 04: Canonical Track Metadata Resolution

## Scope

Task 04 replaces the placeholder metadata echo in
`POST /api/lyrics/resolve` with server-side metadata candidate discovery and
deterministic canonical selection. It preserves the Task 03 request and SSE
envelope contracts.

This slice owns:

- supplied YouTube request metadata;
- YouTube oEmbed lookup;
- MusicBrainz recording search;
- Deezer track search;
- metadata normalization, scoring, deterministic ranking, and canonical
  selection;
- per-source timeout and failure isolation;
- metadata candidate and canonical metadata SSE payloads.

It does not own lyrics lookup, lyrics candidate ranking, caching,
translation, transcription, frontend cutover, or Task 06's final lyrics
result model.

## Provider Policy

All providers are free and require no API key.

1. Supplied YouTube fields always form a local candidate when title or author
   is present.
2. YouTube oEmbed is queried by video ID and may correct or enrich supplied
   title and author.
3. MusicBrainz and Deezer are searched using bounded artist/title query pairs
   parsed from both supplied and oEmbed titles.
4. One provider's timeout, malformed response, HTTP failure, or empty result
   becomes a warning/source outcome; it never terminates the request.

Provider calls use `METADATA_SOURCE_TIMEOUT_MS` (default `5000`, clamped to
`100..=15000`). MusicBrainz receives the required descriptive
`MUSICBRAINZ_USER_AGENT`; its default identifies this repository.

## Candidate Model

Each metadata candidate contains:

- `source`: `supplied`, `oembed`, `musicbrainz`, or `deezer`;
- `artist`, `track`, and optional `duration`;
- stable `stableIds` when supplied by a provider (`youtubeVideoId`,
  `musicbrainzRecordingId`, `deezerTrackId`, and `isrc`);
- numeric `score`;
- machine-readable `scoringReasons`;
- source and stable-ID fields used as deterministic tie-breakers.

Scoring rewards:

- agreement with artist/title evidence from supplied and oEmbed metadata;
- agreement with known duration;
- stable provider identifiers;
- independently returned canonical artist and track fields.

It penalizes missing fields and duration disagreement. Normalized exact and
token similarity comparisons are Unicode-aware and case-insensitive.

## Title Parsing

YouTube titles are noisy. The resolver removes common video decorations such
as `official video`, then generates bounded alternate artist/title pairs from
hyphen-like separators. Both separator orientations are retained. Thus an
incorrect supplied orientation can be corrected by MusicBrainz or Deezer
evidence rather than becoming canonical by construction.

## SSE Sequence

Task 04 emits:

1. `phase: accepted`
2. one `candidate` event per ranked metadata candidate
3. one `warning` event per failed or timed-out source
4. `metadata` containing the selected canonical value and alternates
5. `phase: resolving`
6. the existing Task 03 terminal placeholder `result`, now carrying canonical
   metadata for later tasks

Candidate payloads include source and scoring reasons. Ordering is stable:
score descending, then provider priority, normalized artist, normalized track,
stable identifier, and provider result position.

## Test Plan

- deterministic ranking independent of provider response ordering;
- alternate title orientation corrects bad supplied YouTube metadata;
- stable MusicBrainz and Deezer identifiers survive normalization;
- duration agreement affects ranking;
- timeout and source-error outcomes remain non-terminal;
- provider response parsing rejects incomplete records;
- Task 03 event names and common envelopes remain valid.

## Findings

Implemented on 2026-06-20.

- Rust now resolves supplied/oEmbed seeds through no-key MusicBrainz and
  Deezer searches, preserving YouTube, recording, Deezer, and ISRC IDs.
- Pipe-delimited bad YouTube titles yield bounded alternate search seeds; the
  wrong-metadata fixture shape selects Rosa Walton over the Netflix label.
- Source timeout, HTTP, transport, and malformed-response failures emit
  warnings; supplied metadata remains fallback.
- Deduplication precedes scoring and deterministically merges stable IDs,
  independent of provider completion order.
- SSE remains lazy: `accepted` arrives before provider work; candidates expose
  source, score, reasons, IDs, and selection; terminal Task 03 placeholder
  semantics remain intact.
- Config added: `METADATA_SOURCE_TIMEOUT_MS=5000` and public
  `MUSICBRAINZ_USER_AGENT`; no key required.
- Verified: 21 Rust tests passed; clippy `-D warnings` passed; Wasm cargo check
  passed; full frontend 876 passed/29 skipped; web build passed.
- Full `worker-build` smoke not rerun: host MSVC lacks Windows SDK linker libs
  and `worker-build`; isolated Rust toolchain proved native and Wasm code.
