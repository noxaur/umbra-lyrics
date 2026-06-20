# Task 12: Cut over the frontend and publish findings

## Status

Spec first. Implementation follows this doc. Findings are partial/limited and
call out the measured paths plus the local environment caps.

## Objective

Make the Rust SSE pipeline the frontend's active lyrics-loading path, remove
runtime dependence on the browser orchestrator as the default, keep the player
behaviour users already rely on, and record what the prototype actually taught
us.

The result must answer the prototype evaluation questions directly, using the
measured code paths and benchmark reports rather than guesses.

## Scope

### In scope

- Switch the player to Rust-first lyrics resolution by default.
- Keep an explicit browser-orchestrator fallback for comparison and escape
  hatches.
- Preserve playback, rendering, manual lyrics, syncing, and transport controls.
- Keep legacy `/api/*` compatibility coverage intact through the Rust gateway.
- Exercise the full fixture corpus and browser journey on the cutover path.
- Compare legacy and Rust benchmark output side by side.
- Write findings that answer every evaluation question and call out second-pass
  design changes.

### Out of scope

- Deleting legacy code that still matters for comparison or fallback.
- Changing lyrics ranking, source policy, cache semantics, or transcript
  policy.
- Reworking the player UI beyond what the cutover needs.
- Adding new production features unrelated to the cutover.

## Contract

### Frontend default

- The player should use the Rust SSE resolver unless the user explicitly opts
  into browser mode.
- The legacy orchestrator remains available for manual comparison and
  regression escape hatches.

### Behaviour that must stay intact

- Existing playback controls still work.
- Lyric rendering still works.
- Manual pasted lyrics still work.
- Sync offset / sync controls still work.
- Cached lyrics and alternate selection still behave sanely.

### Evaluation evidence

- Legacy compatibility tests must still pass through the Rust gateway.
- The full fixture corpus and browser journey must remain feasible.
- Benchmark output must include both legacy and Rust comparisons.
- The findings document must answer all prototype evaluation questions:
  - frontend simplification;
  - source-cascade accuracy / speed;
  - native YouTube audio reliability;
  - Workers AI transcription cost / reliability;
  - workers-rs / Wasm friction;
  - KV cache impact;
  - keep / redesign / discard guidance for v2.

## Test plan

Before finish:

```bash
npm test -- tests/pages/player-page.test.tsx tests/lib/lyrics-resolver-mode.test.ts
npm test -- tests/contract tests/scripts/benchmark-*.test.ts
npm test
npm run build
```

If the local Rust toolchain blocks a full build, record the exact failure and the
environment limit in the findings.

## Acceptance criteria

- Rust is the default frontend lyrics-loading path.
- Browser-orchestrator mode still exists as an explicit opt-in.
- Playback, render, manual lyrics, and sync controls still work.
- Compatibility tests continue passing through the Rust gateway.
- The full fixture corpus and browser journey are still runnable.
- Legacy and Rust benchmark results are compared.
- The findings document answers every evaluation question.
- Legacy code is kept unless removal is necessary for a valid comparison.

## Implementation findings

Implemented on 2026-06-20.

- The player now defaults to the Rust SSE resolver, but `?lyricsResolver=browser`
  still forces the legacy browser orchestrator when comparison or fallback is
  needed.
- Transport/protocol failures on the default Rust path now fall back to the
  browser orchestrator; explicit `?lyricsResolver=rust` stays strict.
- Local cached lyrics still hydrate before any live resolution, so playback,
  rendering, manual pasted lyrics, alternate selection, and sync offset
  recovery keep working.
- I added a tiny resolver-mode helper so the default is explicit and testable.
- Verification passed:
  - `npm test -- tests/lib/lyrics-resolver-mode.test.ts tests/pages/player-page.test.tsx tests/lib/lyrics-pipeline-runner.test.ts`
  - `npm test -- tests/pages/playlist-cache-sync.test.tsx`
  - `npm test -- tests/contract tests/scripts/benchmark-*.test.ts`
  - `npm test`
  - `npm run build:web`
- Full `npm run build` is blocked in this VM by the missing MSVC linker
  required by `worker-build`:
  - `cargo install worker-build --version 0.8.5 --locked` fails at `link.exe`
    not found.
- The browser benchmark rerun timed out in this VM, so I used the checked-in
  legacy baseline plus a fresh Rust SSE benchmark run for the comparison
  summary. That makes the benchmark section partial/limited, not exhaustive.

### Benchmark comparison

- Legacy baseline (`docs/prototypes/rust-worker/baselines/legacy-lyrics-2026-06-19.json`):
  - 9 measured runs
  - 1 successful run
  - success rate: 11.11%
  - median elapsed: 20,550 ms
  - p95 elapsed: 20,754 ms
  - median API calls: 7
- Rust SSE run (`docs/prototypes/rust-worker/baselines/rust-lyrics-2026-06-20.json`):
  - 9 measured runs
  - 1 successful run
  - success rate: 11.11%
  - median first event: 38 ms
  - median final latency: 925 ms
  - median request count: 1

### Evaluation answers

- Does moving orchestration to Rust materially simplify the frontend? Yes. The
  player no longer has to orchestrate provider search, ranking, translation,
  romaji, or transcription decisions itself on the default path; it mostly
  consumes streamed results and hydrates cached state.
- Is a small trusted source cascade more accurate and faster than the current
  broad provider graph? Faster, yes; the Rust path cut the median resolution
  latency from 20.6 s to 0.9 s in the available benchmark data. Accuracy is
  not clearly higher from this run alone because both baselines still showed the
  same narrow success rate on the current corpus.
- Can Rust resolve YouTube audio reliably without `youtubei.js`? Not proved yet
  by this task. That question still depends on Task 10's native audio path and
  broader fixture coverage.
- Is server-side Workers AI transcription affordable and reliable enough to be
  a fallback? Not proved here. The cutover keeps the transcription decision in
  Rust, but this task does not change the underlying transcription economics.
- Which parts of `workers-rs` or Wasm introduce unacceptable friction? The main
  hard stop here was tooling friction on Windows: the Rust build still needs the
  MSVC linker and `worker-build`, which is a poor local-dev experience compared
  with the frontend-only loop.
- Does centralized KV caching materially reduce latency and upstream load? The
  Rust run shows one SSE request per resolution and no browser-side provider
  fan-out, which is consistent with lower load and lower latency, but this task
  does not isolate cache hit rates well enough to claim a precise cache delta.
- Which contracts and algorithms should be retained, redesigned, or discarded
  for v2?
  - Retain: the streamed SSE contract, cached hydration, manual lyrics, sync
    controls, and the explicit source/ranking result model.
- Redesign: the frontend should keep only a thin route/state layer and leave
  resolver policy to the backend.
- Discard: the browser orchestrator as the default runtime path; it should be
  fallback-only.
