# Task 10: Replace the legacy YouTube audio adapter

## Status

Spec first. Implementation follows this doc.

## Objective

Replace the legacy audio fetch path with a native YouTube resolver that can
pull audio bytes directly enough for transcription, while keeping the old
service binding as an explicit fallback.

This task must not port `youtubei.js`. The resolver should use a minimal,
bounded InnerTube client chain and only keep the pieces needed to resolve a
range-capable audio URL.

## Scope

### In scope

- Validate video IDs before any YouTube request.
- Validate resolved stream hosts before accepting a URL.
- Try a small, documented InnerTube client sequence.
- Prefer the native resolver before the legacy service binding.
- Keep range requests working for transcription.
- Emit observable attempt / failure data for native resolution.
- Report native-versus-legacy success rates on reference fixtures.
- Tests cover valid and invalid IDs, host filtering, client ordering,
  playability failures, range-capable URLs, native-first fallback, and fixture
  summary math.

### Out of scope

- Porting the full `youtubei.js` client.
- Changing lyric ranking, transcription policy, or SSE shape beyond what the
  audio resolver needs.
- Adding a production analytics backend.
- Reworking the browser-side MKV exporter.

## Contract

### Validation

- Video IDs must be 11 characters from the standard YouTube alphabet.
- Resolved stream URLs must use an allowed host, with direct audio URLs
  restricted to `googlevideo.com` and subdomains.

### Native client chain

- The native resolver must try a bounded, documented sequence of client
  profiles.
- The chain must stop after the documented attempts; no unbounded retries.
- Each attempt records the client, playability status, and failure reason.

### Range-capable URL

- A successful native result must be fetchable with `Range` headers.
- The resolver must return a direct audio URL that transcription can range
  fetch without extra browser-side rewriting.

### Observability

- Native attempts and playability failures must be emitted as structured
  logs.
- Logs must not include audio bytes or transcript content.
- Fallback to the legacy service must be visible as an explicit event.

### Fixture success rates

- Add a small fixture-rate report for native vs. legacy resolution.
- The report must count native successes, legacy-only recoveries, and total
  fixture coverage.
- Tests must pin the summary math.

## Implementation notes

1. Add a native InnerTube resolver that fetches only the minimum page / player
   data needed to discover audio URLs.
2. Keep the existing legacy service binding as the fallback path.
3. Thread resolution attempts into observability events.
4. Add a fixture summary helper so later prototype tasks can compare native
   and legacy success rates without changing the resolver again.

