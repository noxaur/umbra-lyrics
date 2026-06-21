# Rust gateway approval blockers

Recorded during the `modules/` migration. Fix in a separate behavior-change session.

## Approval blockers

1. `cargo test --manifest-path modules/backend/rust-gateway/Cargo.toml`
   has 7 failing tests:
   - native synced/plain candidates expect `Found`, receive `LowConfidence`
   - deterministic resolution expects `found`, receives `low_confidence`
   - invalid video transcription expects `NotFound`, receives `Skipped`
   - observability serialization failure panics
   - two host tests invoke wasm-only `js_sys::Date`
2. `cargo fmt --check` fails in `src/lyrics.rs`.
3. `cargo clippy --all-targets -- -D warnings` fails on warnings and design lint.
4. Production `wrangler.jsonc` has no `AI` binding, but transcription calls
   `env.ai("AI")`.
5. Audio range fetch accepts HTTP 200 and then buffers the response body.
   An origin ignoring `Range` can exceed the Worker memory limit.
6. Cache writes block the SSE path instead of using `Context::wait_until`.
7. Deploy CI builds Rust but does not run Rust tests, fmt, or clippy first.
8. Full Rust Worker build was not available in the audit environment because
   `worker-build` was not installed.

## Follow-up order

1. Decide intended `Found` versus `LowConfidence` semantics.
2. Fix tests and host-safe clock/log behavior.
3. Reject or bound HTTP 200 audio bodies.
4. Add/configure the `AI` binding or remove the unavailable path.
5. Move cache writes to `wait_until`.
6. Add Rust checks to CI.
7. Then deepen lyrics resolution behind a runtime-free semantic interface.
