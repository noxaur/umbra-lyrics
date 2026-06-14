---
id: FB-ux-003
lens: ux
title: Lyric line size presets for venue readability
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Default lyric size may be too small on TV/projector setups or too large on phones held at arm's length.

## Proposal
Three preset sizes (Compact / Standard / Stage) toggled from settings, scaling the active line `clamp()` values. Persist choice in localStorage.

## Acceptance criteria
- [ ] Three sizes visibly different on lyrics stage
- [ ] Choice persists across sessions
- [ ] Active line remains centered during resize

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
