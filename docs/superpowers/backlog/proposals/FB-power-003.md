---
id: FB-power-003
lens: power
title: Fullscreen lyrics stage mode
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
On projectors, browser chrome and transport controls distract from the lyrics.

## Proposal
Toggle fullscreen on the lyrics stage container (not entire page) using Fullscreen API. Hide transport bar until mouse moves.

## Acceptance criteria
- [ ] Fullscreen button in transport bar
- [ ] Esc exits fullscreen
- [ ] Video panel hidden automatically in fullscreen

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
