---
id: FB-lyrics-003
lens: lyrics
title: Instrumental and empty lyrics handling
effort: S
clientOnly: true
mvpBlocker: false
---

## Problem
LRCLIB can return a match with `instrumental: true` and null lyrics. App currently may set `status: ready` with 0 lines, showing misleading "Paste a link to start".

## Proposal
Treat null `plainLyrics` + null `syncedLyrics` as a distinct `no_lyrics` status. Show: "Song found in LRCLIB but no lyrics yet" + link to LRCLIB contribution + shortcuts to manual paste (FB-lyrics-004) and metadata edit (FB-lyrics-002).

## Acceptance criteria
- [ ] Never show empty "ready" stage when LRCLIB match has no lyric text
- [ ] Instrumental flag surfaced in UI
- [ ] Contribution link includes LRCLIB track id when known

## Constraints check
- [x] Client-only
