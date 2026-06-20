# Task 08: English Lyrics + Romaji

## Status

Spec first. Implementation follows this doc.

## Objective

Extend accepted native lyric results with two optional side channels:

- an English lyric column for non-English songs;
- a romaji column for Japanese lyrics.

The resolver must prefer trusted English lyrics before translation, preserve
native lyrics when English lookup fails, and keep Japanese romanization useful
without pretending every language can be transliterated.

## Scope

### In scope

- English-only songs skip unnecessary English lookup and translation.
- Non-English songs first search trusted English lyric sources.
- If search fails, translation fallback can produce English lines.
- English output keeps provenance: found vs translated, provider/backend.
- English line count mismatch is handled as best-effort alignment.
- Alignment degradation is reported explicitly when counts do not match.
- Japanese lyrics produce romaji lines.
- Non-Japanese lyrics do not silently fake romaji; unsupported cases are
  reported explicitly.
- Native lyrics remain the source of truth even when English or romaji fails.
- Tests cover skip/search/translate fallback, alignment, degraded alignment,
  Japanese romaji, unsupported explicit behavior, and provenance.

### Out of scope

- Changing native lyric search, ranking, or caching policy.
- Changing transcription or forced-alignment behavior.
- Adding new provider types beyond the current English and romaji sources.
- Frontend UI polish outside the existing display-mode plumbing.

## Result Shape

Task 08 extends the terminal resolution snapshot with two optional side
channels. Field names mirror the legacy player store and cache contract in
`src/lib/english-lyrics-service.ts`, `src/lib/romaji-service.ts`, and
`src/lib/cache-lyrics-from-pipeline.ts`.

### English

- `status`: `ready`, `loading`, `failed`, or `skipped`
- `source`: `found` or `translated` when `status` is `ready`; otherwise `null`
- `lines`: aligned English text; empty when `status` is `skipped` or `failed`
- `providerId`: present when `source` is `found`
- `translationBackend`: present when `source` is `translated`
- `alignmentDegraded`: `true` when pre-alignment English line count does not
  match the native vocal slot count, even though `lines` is still aligned to
  native indices

### Romaji

- `status`: `ready` or `skipped`
- `lines`: romaji text aligned to native indices when `status` is `ready`;
  empty when `skipped`

## English Lyrics Contract

### Skip

If lyrics are already English, resolver should skip English lookup and
translation.

This must be a true skip:

- no search calls;
- no translation calls;
- native lyrics remain untouched;
- result is marked skipped, with English provenance absent.

### Search

For non-English lyrics, resolver first asks trusted English lyric sources.
Trusted search should happen before any translation fallback.

Reuse the current English-source priority without adding providers:

1. LRCLIB English lookup
2. LyricsTranslate
3. Musixmatch English variant search

Reject candidates that look like native-language duplicates of the accepted
native lyrics. Pick the first usable match in that priority order.

The English result must record provenance:

- `source: "found"`
- `providerId` when a provider supplied the match

### Translate fallback

If no trusted English lyrics are usable, resolver may translate native lines.
Translation is fallback only, never first choice.

The English result must record provenance:

- `source: "translated"`
- `translationBackend` from the free/no-key fallback chain

Translation failure must set `status: "failed"` with empty `lines`. Native
lyrics remain unchanged.

### Alignment and degraded mode

English lines should map onto native line slots using the same proportional
alignment behavior as `alignEnglishLines` in the legacy pipeline.

When pre-alignment counts match, `alignmentDegraded` is `false`.
When counts differ, alignment should still produce native-length output and set
`alignmentDegraded: true` instead of dropping English output.

## Romaji Contract

### Japanese

Japanese lyrics should produce romaji lines that stay line-aligned with native
lyrics where possible.

Preserve current minimum compatibility:

- try the existing `/api/romaji` microservice when available;
- fall back to the legacy local Hepburn romanizer when the service is absent or
  fails.

### Unsupported languages

If lyrics are not Japanese, resolver must not invent romaji.
That case should be explicit in result state so callers can tell the difference
between:

- `ready` with valid romaji;
- `skipped` because language is unsupported for romaji.

## Provenance Contract

Every English result should make source visible:

- skipped;
- found from provider;
- translated from backend.

If alignment degrades, that status should also be visible to callers or
diagnostics. Silent downgrade is not enough.

## Implementation Plan

1. Write task-focused tests for English skip/search/translate behavior.
2. Add alignment checks that cover exact and mismatched line counts.
3. Keep romaji behavior restricted to Japanese, with explicit unsupported
   reporting.
4. Preserve provenance fields through the full pipeline and cache path.

## Fixtures and Assertions

Reference-track assertions should cover at least:

- one English-native track that skips English lookup;
- one non-English native track with trusted English lyrics available;
- one non-English native track that falls back to translation;
- one Japanese plain-lyrics track for romaji output;
- one non-Japanese track that reports romaji as `skipped`.

Use `tests/fixtures/reference-tracks.json` and
`tests/fixtures/lyrics-pipeline/reference-responses.json` where applicable.

## Test Plan

- English-native lyrics skip search and translation.
- Non-English lyrics search trusted English first.
- Translation fallback works when search returns nothing usable.
- Translation failure keeps native lyrics and sets `status: "failed"`.
- English alignment matches native slots and sets `alignmentDegraded` on
  mismatch.
- Japanese lyrics produce romaji.
- Non-Japanese lyrics report unsupported romaji explicitly.
- English results preserve provenance for found vs translated outcomes.
- Cached snapshots preserve English and romaji provenance fields.

## Findings

Not implemented yet.
