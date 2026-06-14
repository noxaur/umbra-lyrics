---
id: FB-perf-001
lens: perf
title: Lyrics cache in IndexedDB
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
LRCLIB API calls take 300–500ms; replaying the same song re-fetches identical data.

## Proposal
Cache LRCLIB responses in IndexedDB keyed by `lrclibId` with 7-day TTL. Check cache before network fetch.

## Acceptance criteria
- [ ] Second play of same song loads lyrics from cache instantly
- [ ] Cache miss falls through to API
- [ ] Clear cache option in settings

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
