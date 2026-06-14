---
id: FB-lyrics-001
lens: lyrics
title: Smart title parsing and LRCLIB search cascade
effort: M
clientOnly: true
mvpBlocker: true
---

## Problem
YouTube titles often use non-Western order (Title — Artist), VTuber brackets 【】, or promo prefixes. Current `parseTrackTitle` + single `track_name`/`artist_name` search misses valid LRCLIB entries (e.g. Ktk_EDLDPeY parses artist/track reversed → 0 results).

## Proposal
1. Extend `parse-track-title.ts`: strip `【】`/`「」`, remove promo prefixes (MV, Official, etc.), detect CJK **Title — Artist** and swap when channel name matches trailing segment.
2. Fetch YouTube oEmbed (`author_name`) as artist fallback when parse yields empty artist.
3. Cascade LRCLIB `/search` strategies in order until a hit with non-empty lyrics:
   - `track_name` + `artist_name` (parsed)
   - `q` = stripped title (no brackets)
   - `q` = `author_name` + core title tokens
   - `track_name` only + duration pick
4. Prefer results with `plainLyrics` or `syncedLyrics`; skip `instrumental: true` with null lyrics.
5. Use `/search` inline lyrics when `/get` 404s but search returned content.

## Acceptance criteria
- [ ] Ktk_EDLDPeY resolves to `track=別世界`, `artist=天音かなた` (or equivalent)
- [ ] Western `Artist - Title` titles unchanged
- [ ] At least 3 cascade strategies before giving up
- [ ] Instrumental/empty LRCLIB entries not treated as success
- [ ] Unit tests for JP/EN/KR title samples

## Constraints check
- [x] Client-only (LRCLIB + oEmbed both CORS-safe)
- [x] No backend
