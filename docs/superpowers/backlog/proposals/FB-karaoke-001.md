---
id: FB-karaoke-001
lens: karaoke
title: Tap line to seek
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
Singers often want to jump to a chorus or skip an intro without scrubbing the timeline.

## Proposal
Click/tap any lyric line to seek the YouTube player to that line's `startMs` (minus sync offset).

## Acceptance criteria
- [ ] Clicking inactive line seeks and highlights it
- [ ] Works with synced and unsynced (approximate) lyrics
- [ ] Keyboard users can focus lines and press Enter to seek

## Constraints check
- [x] Client-only
- [x] No backend
- [x] Fits Vite SPA + Cloudflare static deploy
