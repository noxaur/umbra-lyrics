# Task 06: Rank Candidates and Build Native Lyrics

## Status

Spec first. Implementation follows this doc.

## Objective

Turn the trusted lyrics candidate pool from Task 5 into one native result that
is explainable, deterministic, and useful to the frontend.

This slice owns:

- a canonical lyrics candidate model for ranking and result assembly;
- explainable scoring with machine-readable reason components;
- LRC parsing into timed native lines;
- explicit approximate timing for plain lyrics;
- best-result selection plus useful alternates;
- distinct native outcomes for found, instrumental, low-confidence, and
  not-found cases;
- fixture assertions against the checked-in reference tracks.

It does not own source discovery, cache policy, English lyrics, romaji, or
transcription.

## Scope

### In scope

- Rank the shared Task 5 lyrics candidates using artist, title, duration,
  synchronization, completeness, language, and junk indicators.
- Expose score reasons in a machine-readable form.
- Convert synced LRC text into timed lyric lines.
- Convert plain lyrics into explicitly approximate timed lines.
- Return one best native result plus useful alternates.
- Keep instrumental, low-confidence, and not-found outcomes distinct.
- Add fixture-backed assertions for the six reference tracks.

### Out of scope

- Fetching additional lyrics sources.
- Metadata resolution changes.
- English translation, romaji, or transcription.
- Cache policy or cache key changes.
- Frontend display changes beyond parsing the richer native result.

## Native Result Shape

Task 06 adds a native result that carries:

- `outcome`: `found`, `instrumental`, `low_confidence`, or `not_found`;
- selected candidate identity and source;
- `plainLyrics` / `syncedLyrics`;
- timed `lines` for synced or approximate output;
- `synced` and `approximateTiming` flags;
- `score` and `scoringReasons`;
- alternates with the same explainability data.

Plain lyrics are not treated as failed just because they are unsynced. They
still become a native result with approximate line timing.

## Ranking Policy

Scoring stays deterministic and explainable.

Rewards:

- artist match against the resolved metadata;
- track match against the resolved metadata;
- close duration agreement;
- synced LRC over plain text;
- full lyric text over snippets;
- clean lyric text over junk;
- preferred language match when language is known.

Penalties:

- plain, unsynced text;
- missing or weak metadata agreement;
- short text or low line count;
- junk markers and scraper noise;
- large duration disagreement;
- language mismatch.

The score itself is only for ordering. Outcome selection uses the ranked result
plus completeness and junk checks so plain-but-good lyrics still resolve as
found.

## LRC and Approximate Timing

Synced lyrics are parsed into line objects with start and end times.

Plain lyrics are split into lines and assigned approximate timing across the
known duration when available. If duration is missing, the fallback timing must
still be explicit and deterministic.

The timed line model is small and serializable so fixture tests can assert exact
starts, ends, and approximate-vs-synced behavior.

## Fixtures and Assertions

Reference-track assertions should cover:

- one synced English track;
- one plain Japanese track;
- one plain Spanish track;
- one synced English track with fractional timestamps;
- one non-English native track;
- one low-confidence or instrumental edge case.

The assertions should verify:

- candidate ranking picks the intended native result;
- line timing exists for synced and plain lyrics;
- approximate timing is explicitly flagged;
- alternates stay populated when more than one usable candidate exists;
- not-found and instrumental results remain distinct.

## Test Plan

- ranking prefers artist/title/duration agreement over weaker matches;
- synced LRC beats plain lyrics when both are usable;
- plain lyrics get deterministic approximate timing;
- low-confidence and not-found results do not collapse together;
- instrumental result stays separate from not-found;
- reference fixtures from `tests/fixtures/reference-tracks.json` and
  `tests/fixtures/lyrics-pipeline/reference-responses.json` pass native result
  assertions.

## Findings

To be filled after implementation.
