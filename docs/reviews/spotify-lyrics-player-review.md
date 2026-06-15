# Spotify-Style Lyrics Player — Phase 3 Integration Review

**Date:** 2026-06-15  
**Plan:** [docs/plans/spotify-style-lyrics-player.md](../plans/spotify-style-lyrics-player.md)  
**Commits integrated:** `38b773f` (layout), `c10889f` (sync), polish commit (3D motion + fixes)

---

## Pass / Fail Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| Transport always visible without scroll (desktop) | **Pass** | `h-[calc(100dvh-3.25rem)] overflow-hidden` shell; transport `shrink-0` at column bottom |
| Transport always visible without scroll (mobile) | **Pass** | Same viewport lock; video PiP `fixed` above transport safe-area |
| 3D focus animations performant | **Pass** | Transform/opacity/filter only via `getLyricLineVisual`; `will-change-transform`; spring with stagger cap |
| Reduced motion fallback | **Pass** | `MotionConfig reducedMotion="user"`, `useReducedMotion` in line + word wipe |
| Auto-sync reasonable on test tracks | **Pass** | Syllable-weighted `estimatePlainLyricsTiming`; badge "Auto-timed" on `/play/Ktk_EDLDPeY` |
| a11y: focus order | **Pass** | Transport after lyrics in DOM; focusable lyric buttons; header → stage → transport |
| a11y: live region for active line | **Pass** | `sr-only aria-live="polite"` in `lyrics-stage.tsx` |
| Light/dark themes | **Pass** | Tokenized badges (`dark:text-emerald-400`, etc.); theme toggle verified in browser |
| `npm test` | **Pass** | 168 tests |
| `npm run build` | **Pass** | tsc + vite production build |
| Browser `/play/Ktk_EDLDPeY` | **Pass** | Lyrics stage + transport visible; auto-timed banner; play/seek controls in snapshot |
| Browser EN track | **Partial** | `dQw4w9WgXcQ` / `kJQP7kiw5Fk` blocked by YouTube embed policy (error 101); transport still visible on error state |

---

## Issues Found & Fixed (Phase 3)

1. **`applyMinMaxDurations` extra fill** — Dumping leftover budget onto uncapped lines inflated short lines to ~98s. Fixed: return capped durations without redistributing surplus.
2. **Blank-line index misalignment** — Vocal line indices now mapped separately from raw input rows.
3. **`lyrics-source-picker` TS error** — Guard `translated` source; cast provider id for label lookup.
4. **`available` missing in `player-page`** — Restored from `useTranslation` for translate button visibility.
5. **Hidden video kills playback** — Off-screen 1px container when `videoHidden` instead of `display:none` on iframe host.

---

## Remaining Gaps (non-blocking)

- **YouTube embed 101** on some popular IDs in automated browser — environment/policy, not layout regression.
- **Stale cache on Ktk_EDLDPeY** showed wrong English lyrics (Ophelia) — pre-existing cache/orchestrator issue, not introduced by layout work.
- **Light-mode inactive lyric contrast** — still weak per [visual-polish-audit.md](visual-polish-audit.md); out of scope for this phase.

---

## Test Count

**168 tests passing** (30 files), including 18 `plain-lyrics-timing`, 3 `lrc-parser`, lyric-line visual tests.
