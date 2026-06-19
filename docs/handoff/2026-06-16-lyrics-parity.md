# Handoff: lyrics stage ↔ handoff-demo v3 parity

**Date:** 2026-06-16  
**Repo:** `noxaur/umbra-lyrics` (umbra)  
**Reference:** `public/handoff-demo.html` (lyrics animation v3 — viewport center log stack)

## Objective

Make production lyrics look one-to-one with `public/handoff-demo.html`. The demo is the visual source of truth for dark-mode karaoke stage: depth stack, tokens, spacing, and glow.

## Status

| Item | State |
|------|--------|
| Implementation | **Merged** — [PR #38](https://github.com/noxaur/umbra-lyrics/pull/38) |
| Tests | `npm test` — 365 passed (includes `tests/lib/handoff-demo-parity.test.tsx`) |
| Prod visual QA | **Not confirmed in session** — YouTube/lyrics load blocked browser A/B locally |

## What changed (see PR #38 diff)

- **`src/index.css`** — Dark tokens: stage `#12101c`, active `#c4b5fd`, ink `#f3f4f6` (`--karaoke-ink`)
- **`src/components/lyrics-stage.tsx`** — Bordered rounded stage, `max-w-xl`, `gap-[0.65rem]`, `scroll-py-10`
- **`src/components/lyric-line.tsx`** — Single clamp size, handoff padding/glow, inactive `text-karaoke-ink`
- **`src/lib/lyrics-stage-layout.ts`** — Edge spacer `height/2 - 32` (handoff v3)
- **`tests/lib/handoff-demo-parity.test.tsx`** — Structure/class regression test

Depth/scroll logic (`lyric-line-visual.ts`, `lyrics-follow-scroll.ts`, `lyric-scroll.ts`) already matched handoff tiers before this pass; this work was **visual chrome + tokens**.

## Handoff demo assets (repo)

- `public/handoff-demo.html` — **target** (v3 log stack)
- `docs/handoff/demo-v3.html` — same demo (minus one sidebar card)
- `docs/handoff/demo.html` — older 3D/sync demo (different inactive sizing)

## Verification checklist for next agent

1. Deploy or use preview with merged `main`.
2. Side-by-side: `/handoff-demo.html` vs `/play/dQw4w9WgXcQ` (seek past intro ~0:19).
3. CDP spot-check active line: `rgb(196, 181, 253)`, inactive base `rgb(243, 244, 246)`, stage bg `rgb(18, 16, 28)`, gap `10.4px`, glow `24px @ 40%`.
4. Run `npm test` after any follow-up edits.

## Open / follow-up

- **Browser parity sign-off** on live prod (`song.opsec.rent` or `song-kara.nox-heights.workers.dev`) if not done post-merge.
- **Light theme** — handoff is dark-only; light `--karaoke-ink` uses `oklch(0.15 0.02 280)`; no parity pass requested.
- **TV mode** — `TV_LINE_SIZE` / `TV_STACK` unchanged; not part of handoff-demo scope.
- Local `package-lock.json` may have unrelated `npm install` churn — do not commit unless intentional.

## Branches / workspace notes

- Work started in worktree `1yyc` on `cursor/a5813a6f`; PR merged to `main`.
- Main repo path: `/home/arch/Documents/Projects/ai/umbra-lyrics`
- `cursor/a5813a6f` may be diverged from remote; use `origin/main` as source of truth post-merge.

## Suggested skills

| Skill | When |
|-------|------|
| `verification-before-completion` | Before claiming prod parity |
| `impeccable` | If visual diff remains after deploy |
| `diagnose` / `systematic-debugging` | Scroll/centering regressions |
| `using-git-worktrees` | Isolated follow-up branches |
| `finishing-a-development-branch` | Cleanup after parity confirmed |
| `context7-mcp` | Tailwind v4 / Motion docs if tweaking styles |
| `goal` | If resuming `/goal` loop for parity QA |
