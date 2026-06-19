# Task 02: Rust Public Worker Shell

## Status

Implementation in progress.

## Objective

Make a `workers-rs` Worker the public entrypoint without changing the existing
application or `/api/*` behavior. The Rust Worker serves the built SPA through
an assets binding and forwards every `/api/*` request to the frozen TypeScript
Worker through a service binding.

## Caveman Constraint

`caveman` was invoked in read-only mode before implementation:

```text
caveman --tools read,grep,find,ls --no-session --max-turns 3 -p \
  "Review docs/prototypes/rust-worker/README.md task 2 and the current worker shell/contracts..."
```

It exited before analysis because no model provider or API key was configured:

```text
No API key found for unknown.
```

This is the same environment constraint recorded by Task 1, so implementation
continues without Caveman output.

## Scope

### In scope

- A `wasm32-unknown-unknown` `workers-rs` crate.
- A public Rust Worker configuration with `ASSETS` and `LEGACY` bindings.
- A separately deployable TypeScript legacy Worker.
- Existing HTTPS and `/watch?v=` redirects.
- Existing security and cross-origin-isolation headers.
- Request correlation and Rust-versus-legacy failure attribution.
- Body-stream-preserving request and response forwarding.
- Local multi-Worker smoke tests and an opt-in deployed smoke command.

### Out of scope

- Rewriting individual legacy API handlers in Rust.
- Changing API payloads, CORS policy, provider behavior, or frontend behavior.
- Adding the Task 3 SSE endpoint.
- Production hardening beyond what is required to expose prototype findings.
- Deploying to the production route without explicit deployment authorization.

## Design

The public Worker has four routing outcomes:

1. Redirect non-API HTTP requests to HTTPS.
2. Redirect a valid `/watch?v=VIDEO_ID` request to `/play/VIDEO_ID`.
3. Forward every `/api/*` request to the `LEGACY` service binding.
4. Fetch every other request from the `ASSETS` binding.

The gateway passes the original request body to the selected binding and
returns the selected binding's response body directly. It does not call
`text()`, `json()`, `bytes()`, or otherwise consume either stream.

Every gateway response includes:

- `Strict-Transport-Security`;
- `Referrer-Policy`;
- `X-Umbra-Request-Id`;
- `X-Umbra-Origin`, set to `legacy`, `rust-assets`, or `rust`.

Static assets and HTTP redirects also include the existing COOP/COEP headers.
Gateway-generated failures use a stable JSON shape and identify `rust` as
their origin. Responses returned by the service binding identify `legacy`.

## Build and Deployment Shape

- `wrangler.legacy.jsonc` remains the Vite plugin input for the TypeScript
  Worker and emits `dist/song_kara_legacy/wrangler.json`.
- `rust-worker/` builds the public Wasm entrypoint.
- Root `wrangler.jsonc` deploys the Rust Worker under the existing `song-kara`
  name and binds `LEGACY` to `song-kara-legacy`.
- Deployment publishes `song-kara-legacy` first, then `song-kara`.
- Local development starts both generated configurations in one Wrangler
  process so the service binding is exercised rather than mocked.

## Test Plan

Focused checks:

```bash
cargo test --manifest-path rust-worker/Cargo.toml
npm test -- tests/contract
```

Local Rust gateway compatibility:

```bash
npm run test:rust-worker
```

Opt-in deployed compatibility:

```bash
CONTRACT_BASE_URL=https://<rust-worker-host> npm run test:rust-worker:deployed
```

Completion checks:

```bash
npm test
npm run build
npm run deploy:dry-run
```

## Acceptance Criteria

- The built application loads through the local Rust Worker.
- The Task 1 API and Worker-shell contracts pass through the Rust gateway.
- Request bodies, response streams, range headers, and partial response
  metadata pass through without buffering.
- Static assets are served through the Rust Worker's assets binding.
- Gateway and legacy failures have distinct origin attribution and a shared
  request ID.
- Build output contains independently deployable legacy and public Workers.
- Local and deployed smoke commands are documented and executable.

## Implementation Findings

Implemented on 2026-06-19.

- `workers-rs` 0.8.5 builds successfully with the repository's installed
  `worker-build`. The public bundle is
  `rust-worker/build/worker/shim.mjs`; generated Rust build artifacts and Cargo
  targets are ignored.
- The Vite plugin now builds `song-kara-legacy` from
  `wrangler.legacy.jsonc`, while root `wrangler.jsonc` owns the public
  `song-kara` route and its `LEGACY` service binding.
- The first transport implementation used the workers-rs `http` feature.
  Local streaming tests found that this adapter wraps a downstream
  `ReadableStream` in a Rust polling bridge; canceling the response surfaced
  `Error polling body`. The final gateway uses workers-rs native
  `Request`/`Response` wrappers and reconstructs only headers/status around the
  original `ResponseBody::Stream`, leaving the stream unconsumed.
- Cloning incoming requests to add correlation headers also left an unused tee
  of POST bodies and caused repeated HTTP contract runs to fail. The final
  gateway constructs the forwarded request around the original body stream,
  preserving request streaming without creating a second branch.
- An uncaught exception in a service-bound Worker becomes a platform response
  before the caller can decorate it. The legacy Worker therefore has a
  top-level error boundary that returns a stable legacy-origin error with the
  shared request ID. Rust binding failures use a separate stable
  `rust_gateway_error` response.
- Production hosts retain the frozen HTTP-to-HTTPS behavior. Loopback hosts
  skip HTTPS enforcement so a local multi-Worker smoke test can exercise the
  gateway without following redirects to production.
- `npm run test:rust-worker` starts three local configurations: the real
  gateway plus legacy Worker, a streaming/range fixture Worker, and a gateway
  without assets to prove Rust-origin failure attribution.
- Verification completed:
  - `cargo clippy --manifest-path rust-worker/Cargo.toml --all-targets -- -D warnings`
  - `cargo test --manifest-path rust-worker/Cargo.toml` — 7 passed
  - `npm run test:rust-worker` — 55 real-worker contract assertions, 6
    transport assertions, and 1 Rust-failure assertion passed
  - `npm test` — 862 passed, 25 skipped
  - `npm run deploy:dry-run` — both `song-kara-legacy` and `song-kara`
    validated successfully
- The repository-wide `npm run lint` remains red on pre-existing Vite+ import
  and test type-resolution errors outside this task. A scoped lint run over
  the changed runtime, smoke, config, and contract files passed. The modified
  Task 1 inventory test still triggers its existing `router.ts?raw`
  type-resolution error when linted alone.
- No production deployment was performed. The deployed smoke command is
  available as
  `CONTRACT_BASE_URL=https://<rust-worker-host> npm run test:rust-worker:deployed`.
