---
id: FB-lyrics-005
lens: lyrics
title: MusicBrainz canonical metadata for LRCLIB lookup
effort: M
clientOnly: true
mvpBlocker: false
---

## Problem
YouTube titles rarely match music-database canonical names. LRCLIB `q` search alone may miss alternate spellings/transliterations.

## Proposal
After parse, query MusicBrainz `/ws/2/recording?query=...&fmt=json` (≤1 req/s, no custom User-Agent header). Use recording + artist-credit to build canonical track/artist for LRCLIB cascade. Fallback to parse if MB returns nothing in 2s.

## Acceptance criteria
- [ ] MB lookup only when LRCLIB cascade fails
- [ ] Rate-limited to 1 req/s
- [ ] Canonical names fed into LRCLIB search
- [ ] Graceful timeout → skip MB

## Constraints check
- [x] Client-only (MusicBrainz CORS `*`)
- [x] Metadata only; lyrics still from LRCLIB
