---
id: FB-power-002
lens: power
title: Shareable deep link /play/:videoId
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Users cannot share a karaoke session link with friends.

## Proposal
Route `/play/:videoId` is already shareable. Add a "Copy link" button on the player page that copies `window.location.href` to clipboard.

## Acceptance criteria
- [ ] Copy link button on player page
- [ ] Pasting shared URL loads correct video
- [ ] Toast confirms copy success

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
