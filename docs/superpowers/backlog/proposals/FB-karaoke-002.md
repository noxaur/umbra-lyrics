---
id: FB-karaoke-002
lens: karaoke
title: Fine-grained sync offset slider
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
±0.5s buttons may not be enough when LRC timing is consistently off by 1–2 seconds.

## Proposal
Add a range slider (-5s to +5s) alongside existing ±0.5s buttons. Show current offset value. Persist per-song in session.

## Acceptance criteria
- [ ] Slider updates lyrics highlight in real time
- [ ] Offset resets when loading a new song
- [ ] Value displayed as `+1.5s` / `-0.5s`

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
