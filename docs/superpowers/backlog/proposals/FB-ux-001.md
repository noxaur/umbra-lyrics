---
id: FB-ux-001
lens: ux
title: Keyboard shortcuts for transport
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Singers at a keyboard cannot easily pause or restart without reaching for the mouse.

## Proposal
Add global shortcuts: Space = play/pause, ArrowLeft/Right = ±5s seek, +/- = sync offset.

## Acceptance criteria
- [ ] Shortcuts work when focus is not in a text input
- [ ] Shortcuts listed in a `?` help popover
- [ ] No conflict with browser defaults when typing in URL field

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
