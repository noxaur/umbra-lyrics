---
id: FB-perf-003
lens: perf
title: Prefetch lyrics on URL paste
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
Users wait for lyrics only after the player page loads and YouTube metadata resolves.

## Proposal
On valid URL paste (before navigation), start LRCLIB search using video title from oEmbed or a lightweight YouTube metadata fetch. Store result in sessionStorage for player page.

## Acceptance criteria
- [ ] Lyrics often ready before player mounts
- [ ] Graceful fallback if prefetch fails
- [ ] No duplicate fetch on player load

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
