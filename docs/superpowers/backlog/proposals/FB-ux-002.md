---
id: FB-ux-002
lens: ux
title: Instant URL paste with auto-submit
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Pasting a YouTube URL still requires an extra click on "Start" — friction at the moment users are most eager to sing.

## Proposal
Detect clipboard paste in the URL field and auto-navigate to the player when a valid video ID is detected. Show a brief "Loading…" state on the input border.

## Acceptance criteria
- [ ] Paste of valid YouTube URL navigates within 300ms
- [ ] Invalid paste shows inline error without navigation
- [ ] Works on mobile paste from share sheet

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
