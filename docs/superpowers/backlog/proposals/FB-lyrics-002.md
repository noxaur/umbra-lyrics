---
id: FB-lyrics-002
lens: lyrics
title: Manual artist and track edit with retry
effort: S
clientOnly: true
mvpBlocker: true
---

## Problem
Error state promises "try editing artist/title" but no UI exists. Users cannot recover from bad parses without reloading.

## Proposal
On lyrics error (or empty result), show inline form: Artist, Track, optional Album. "Search again" re-runs `fetchLyrics` cascade (FB-lyrics-001) with user values. Persist last-edited values in sessionStorage for the videoId.

## Acceptance criteria
- [ ] Error state shows editable Artist + Track fields
- [ ] Retry triggers new LRCLIB search without page reload
- [ ] Corrected metadata for Ktk_EDLDPeY finds LRCLIB entry (even if lyrics empty, show instrumental notice)
- [ ] Loading state during retry

## Constraints check
- [x] Client-only
