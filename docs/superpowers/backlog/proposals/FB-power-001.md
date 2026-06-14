---
id: FB-power-001
lens: power
title: Recent songs in localStorage
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Repeat users must re-paste the same YouTube URL every session.

## Proposal
Store last 10 played songs (videoId, title, timestamp) in localStorage. Show a "Recent" list on the home page below the URL input.

## Acceptance criteria
- [ ] Recent list shows on home page when history exists
- [ ] Clicking entry navigates to `/play/:videoId`
- [ ] Clear history button removes all entries

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
