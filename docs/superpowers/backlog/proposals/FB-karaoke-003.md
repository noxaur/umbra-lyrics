---
id: FB-karaoke-003
lens: karaoke
title: Instrumental gap indicator
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
Long instrumental breaks in LRC files show empty lyrics stage with no context — singers don't know if lyrics ended or music is playing.

## Proposal
Detect gaps >8s between consecutive LRC lines and show a subtle "♪ instrumental ♪" placeholder line that pulses gently.

## Acceptance criteria
- [ ] Gaps >8s show instrumental placeholder
- [ ] Placeholder respects reduced-motion (static text only)
- [ ] Does not appear for unsynced fallback mode

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
