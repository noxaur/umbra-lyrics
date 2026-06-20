# Task 09: Workers AI Verification + Transcription

## Status

Spec first. Implementation follows this doc.

## Objective

Use Workers AI Whisper to do two jobs:

- verify weak lyric candidates before accepting them;
- generate plain lyrics when no acceptable source result exists.

This task must keep audio acquisition behind the legacy Worker service binding
for now. Task 10 later replaces that adapter.

## Scope

### In scope

- Strong source matches do not call Workers AI.
- Weak candidates trigger a bounded sample transcription first.
- If no acceptable source result exists, resolver performs full transcription.
- Audio stays within the Workers 128 MB isolate limit by range fetching and
  chunking.
- Transcription returns typed partial / not-found outcomes instead of a flat
  failure.
- Transcription metrics are emitted for cost-sensitive tracking.
- Result snapshots record `usedLegacyAudioAdapter: true`.
- Tests cover strong skip, weak sample, not-found full, legacy adapter use,
  range/chunk planning under 128 MB, metrics, typed partial, and the legacy
  adapter flag.

### Out of scope

- Changing Task 6 ranking rules.
- Changing Task 8 English / romaji output.
- Replacing the legacy audio adapter with native Rust YouTube resolution.
- UI polish beyond whatever Task 9 needs for contract wiring.
- Adding new provider families beyond Workers AI Whisper and the existing
  legacy audio path.

## Contract

Task 9 extends the terminal resolution snapshot with transcription-specific
fields.

### Transcription state

- `status`: `skipped`, `sampled`, `transcribed`, `partial`, or `not-found`
- `mode`: `sample` or `full`
- `source`: `whisper` when Workers AI ran; otherwise `null`
- `usedLegacyAudioAdapter`: `true` for all Task 9 audio fetches
- `partial`: `true` when the audio or transcript was incomplete
- `chunks`: number of Whisper calls used
- `vocalDensity`: ratio of vocal duration to covered audio
- `coverageSec`: seconds of audio covered by the transcript
- `sampleAccepted`: `true` when sample verification passed
- `sampleRejected`: `true` when sample verification failed and forced full
  transcription
- `notFound`: `true` when full transcription produced no usable transcript

### Metric events

Emit cost-relevant metrics for:

- audio bytes fetched;
- audio fetch mode (`sample` vs `full`);
- range requests count;
- Whisper call count;
- partial outcome;
- verification path taken;
- legacy audio adapter use.

Metrics must be structured, typed, and safe to omit if the sink is missing.

## Behavior

### Strong skip

If Task 6 already has a strong acceptable result, Task 9 must not invoke
Workers AI.

This is a hard skip:

- no audio fetch;
- no Whisper call;
- no transcription metrics beyond skip accounting;
- result remains unchanged except for explicit `status: "skipped"`.

### Weak sample

Weak candidates use a bounded sample transcription first.

Rules:

- fetch only a capped audio sample;
- keep total bytes within the sample cap;
- run one Whisper pass for the sample;
- accept the candidate only if sample verification passes;
- on failure, escalate to full transcription or return typed partial /
  not-found as appropriate.

### Not-found full

If no acceptable source result exists, Task 9 runs full transcription.

Rules:

- use legacy audio adapter;
- fetch audio by range within the 128 MB worker limit;
- chunk only when needed to stay under the memory cap;
- merge chunk transcripts deterministically;
- if the transcript is empty, return typed `not-found` instead of an
  untyped exception.

### Typed partial

Partial outcomes must be explicit, not guessed from generic errors.

Examples:

- sample transcript too weak to accept;
- audio truncated before the full track ends;
- chunked transcription produced some text but not full coverage.

Partial results still need provenance and metrics.

## Test Plan

### Unit tests

- Strong source match skips Workers AI.
- Weak candidate uses sample transcription first.
- Rejected sample escalates to full transcription.
- No source result triggers full transcription.
- Audio fetch plans stay within the 128 MB limit.
- Range-chunk planning splits large streams into bounded fetches.
- Metrics are emitted for audio bytes, ranges, Whisper calls, and partial
  state.
- Typed partial result is returned when audio or transcript is incomplete.
- `usedLegacyAudioAdapter` is `true` on produced results.

### Contract tests

- Router path still serves `POST /api/lyrics/transcribe`.
- Response shape remains typed and serializable.
- Legacy adapter path remains the only audio acquisition route for Task 9.

## Implementation Notes

1. Extend the transcription service so Task 9 can decide skip / sample / full
   before audio fetch.
2. Keep audio acquisition behind the legacy Worker binding.
3. Add explicit typed partial and not-found states instead of reusing generic
   5xx failures.
4. Record byte, range, and Whisper-call metrics in the returned snapshot.
5. Lock behavior with focused tests before widening anything else.

## Findings

Implemented on 2026-06-20.

- Rust resolution now emits a transcription side channel with explicit status,
  mode, metrics, and `usedLegacyAudioAdapter`.
- Strong native results still skip Workers AI.
- Weak native results take a bounded sample path first, then escalate to full
  transcription only when needed.
- Full transcription uses the legacy YouTube proxy binding, range fetches,
  chunk planning, and Whisper aggregation.
- Failed transcription returns typed `not_found` / `partial` state instead of
  a flat error.
- Result payloads keep native lyrics shape and now expose the transcription
  side channel plus top-level `usedLegacyAudioAdapter`.
- Verification:
  - `cargo fmt --manifest-path rust-worker/Cargo.toml --all --check`
  - `cargo test --manifest-path rust-worker/Cargo.toml task9 -- --nocapture`

- `cargo test` could not finish in this VM because the installed MSVC
  toolchain is missing `link.exe`. That is an environment limit, not a repo
  regression.
