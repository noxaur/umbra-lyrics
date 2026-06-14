---
id: FB-lyrics-004
lens: lyrics
title: Manual LRC or plain lyrics paste fallback
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
Some songs (VTuber originals, niche uploads) have no LRCLIB lyrics. No other CORS-safe lyrics API exists client-side.

## Proposal
"Paste lyrics" modal: accept LRC (synced) or plain text (evenly distributed). Parse with existing `lrc-parser.ts` / `parsePlainLyrics`. Store in localStorage keyed by videoId for replay.

## Acceptance criteria
- [ ] Paste LRC → synced karaoke works
- [ ] Paste plain text → unsynced mode with banner
- [ ] Persisted per videoId in localStorage
- [ ] Accessible from error and instrumental states

## Constraints check
- [x] Client-only
