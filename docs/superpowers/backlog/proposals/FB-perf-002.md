---
id: FB-perf-002
lens: perf
title: Skeleton lyrics stage during fetch
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Blank lyrics area during LRCLIB fetch feels broken; spinners alone don't convey expected layout.

## Proposal
Show 5–8 pulsing skeleton lines in the lyrics stage while fetching. Replace with real lyrics on load.

## Acceptance criteria
- [ ] Skeleton visible within 100ms of navigation
- [ ] Skeleton respects reduced-motion (static bars)
- [ ] Replaced smoothly when lyrics arrive

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
