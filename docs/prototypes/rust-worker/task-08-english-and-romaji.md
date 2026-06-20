# Task 08: English Lyrics + Romaji

## Status

Spec written before implementation.

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

The English result must record provenance:

- `source: "found"`
- provider identity, when a provider supplied the match

### Translate fallback

If no trusted English lyrics are usable, resolver may translate native lines.
Translation is fallback only, never first choice.

The English result must record provenance:

- `source: "translated"`
- translation backend used

### Alignment and degraded mode

English lines should map onto native line slots.

When counts match, alignment is clean.
When counts differ, alignment should still produce a readable best-effort map
and mark the outcome as degraded instead of dropping output.

## Romaji Contract

### Japanese

Japanese lyrics should produce romaji lines that stay line-aligned with native
lyrics where possible.

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

## Test Plan

- English-native lyrics skip search and translation.
- Non-English lyrics search trusted English first.
- Translation fallback works when search returns nothing usable.
- English alignment matches native slots and degrades cleanly on mismatch.
- Japanese lyrics produce romaji.
- Non-Japanese lyrics report unsupported romaji explicitly.
- English results preserve provenance for found vs translated outcomes.

## Findings

Not implemented yet.
