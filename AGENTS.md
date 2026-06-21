# AGENTS.md

## Cursor Cloud specific instructions

`umbra` is a **client-side karaoke web player** (React 19 + Vite via `vite-plus`/`vp`).
It is one product made of a few services. Standard commands live in `README.md` and
`package.json` `scripts` — prefer those. Notes below are the non-obvious gotchas.

### Services
- **Frontend SPA + legacy API worker** (the product): `npm run dev` → http://127.0.0.1:5173.
  `vp dev` runs the Vite SPA together with the legacy Cloudflare Worker (`modules/backend/legacy-worker/`, via
  `wrangler.legacy.jsonc`), which proxies `/api/*` to external APIs (LRCLIB, YouTube, etc.).
- **Rust/Wasm gateway** (`modules/backend/rust-gateway/`): production gateway, built by `npm run build:rust`.
  Not needed for normal feature work in dev.
- **Romaji microservice** (`modules/backend/romaji/`, Python/FastAPI): optional; only Japanese romaji.

### Running the dev server (important gotcha)
`npm run dev` fails out of the box in this environment with
`Could not start remote dev session. No credentials found` — the worker's `AI` (Workers AI)
binding has no local emulator, so the Cloudflare Vite plugin tries to open an authenticated
**remote proxy session**. To run fully local without Cloudflare credentials, start it with:

```
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run dev
```

This disables remote bindings. The `AI` (server-side Whisper) feature then no-ops, but the
core app (playback UI, lyrics pipeline, `/api/*` proxies) works. Workers AI / Spotify login
only function when run on real Cloudflare with the proper binding + secrets.

### YouTube playback is blocked in this cloud VM (expected)
- The dev server sets `Cross-Origin-Embedder-Policy: credentialless` (in `vite.config.ts`,
  needed for ffmpeg.wasm `SharedArrayBuffer`). This blocks the cross-origin YouTube `/embed`
  iframe (`net::ERR_BLOCKED_BY_RESPONSE`), so the player can get stuck on "Opening player…".
- Even if the embed loads, YouTube blocks playback from datacenter IPs with
  "Sign in to confirm you're not a bot" / "Embedding is disabled".
- Net effect: **live video playback and the moving lyric highlight cannot be demonstrated in
  the cloud VM.** The lyrics pipeline itself works — pasting a link / picking a song resolves
  metadata and fetches time-synced lyrics from LRCLIB (shows "Synced" + "LRCLIB" badges and an
  intro timestamp). Lyric *lines* only render once playback time passes the intro, so they stay
  hidden without playback. To verify playback-dependent behavior, test on a real browser/IP.

### Lint / test / build
- `npm test` (`vp test`) runs vitest/jsdom only — no Rust or Cloudflare needed. ~890 tests.
- `npm run lint` currently reports pre-existing TypeScript resolution errors in `tests/**`
  (e.g. "Cannot find module 'vitest'", `@/...` aliases) from the type-aware lint pass. These are
  not caused by app changes.
- **Full build needs Rust ≥ 1.85** (the default VM Rust 1.83 is too old: `worker-build 0.8.5`'s
  deps require `edition2024`). One-time setup for `npm run build` / `npm run build:rust` /
  `npm run test:rust-worker`:
  - `rustup default stable && rustup target add wasm32-unknown-unknown`
  - system `libssl-dev` + `pkg-config` (needed to compile worker-build)
  - `cargo install worker-build --version 0.8.5 --locked`
  `npm run build` runs `tsc -b && vp build` then the Rust/Wasm gateway build.

### Manual UI testing
Use Playwright's installed `chromium` for headless checks, but note it lacks proprietary
codecs, so YouTube video still won't decode there. Reach the player UI directly via
`/play/:videoId` (e.g. `/play/dQw4w9WgXcQ?debug=1`; `?debug=1` shows a yt-ready/time badge).

## Agent skills

### Issue tracker

GitHub Issues are the tracker for this repo, and external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical GitHub labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one root `CONTEXT.md` and one root `docs/adr/` directory when domain docs are added. See `docs/agents/domain.md`.
