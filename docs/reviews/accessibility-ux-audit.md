# Accessibility & Inclusive UX Audit — song-kara

**Date:** 2026-06-15  
**Standard:** WCAG 2.2 Level AA  
**Scope:** Home (`/`), Player (`/play/:videoId`), both themes  
**Methods:** Source review, OKLCH contrast math, live tab-order on `http://127.0.0.1:4173` (preview)

---

## Executive summary

song-kara has solid foundations: `focus-visible` rings, many `aria-label`s on transport controls, `aria-invalid`/`role="alert"` on URL errors, `MotionConfig reducedMotion="user"` on lyric lines, `min-h-[44px]` targets, and `lang="en"` on `<html>`.

**Blockers for blind/low-vision karaoke use:** no `aria-live` for active lyric, light-theme contrast failures on lyrics/warnings, and keyboard focus polluted by Motion ghost stops + YouTube iframe before app controls.

---

## Tab order (browser verification)

### Home (`/`)

| # | Element | Issue |
|---|---------|-------|
| 1 | `song-kara` link | OK |
| 2 | Theme button | OK |
| 3 | **Hidden `motion.span` (Sun icon)** | **Phantom focus — `tabindex="0"`, not visible in dark theme** |
| 4 | `motion.span` (Moon/Music icon) | **Phantom focus — no accessible name** |
| 5 | URL input | Name from placeholder only |
| 6 | Start | OK |
| 7 | `motion.span` (Start icon) | **Phantom focus** |

### Player (`/play/:videoId`)

| # | Element | Issue |
|---|---------|-------|
| 1–3 | Header + phantom spans | Same as home |
| 4 | **YouTube `<iframe>`** | **Tab stop before lyrics/transport; external trap risk** |
| 5 | ← Home | OK |
| 6–13 | Transport controls | Labels mostly OK |
| — | Lyric lines | **Not loaded in test env; when loaded, N buttons in tab order** |

**Hidden video:** `aria-hidden={true}` on panel, but iframe stays in tab order (`offsetHeight` > 0). `aria-hidden` does not remove focusability — use `inert` or `tabindex="-1"` on iframe when hidden.

---

## WCAG violations by criterion

| Criterion | Level | Severity | Finding | Location |
|-----------|-------|----------|---------|----------|
| **1.3.1** Info and Relationships | A | High | URL field has no `<label>`; accessible name is placeholder only | `url-input.tsx` |
| **1.3.1** | A | Medium | Player page has no page-level `<h1>` | `player-page.tsx` |
| **1.4.3** Contrast (Minimum) | AA | **Critical** | Light active lyric `karaoke-active` on stage: **~2.67:1** (needs 4.5:1) | `index.css`, `lyric-line.tsx` |
| **1.4.3** | AA | **Critical** | Light inactive lyrics (opacity 0.55): **~2.07:1** effective | `lyric-line.tsx` |
| **1.4.3** | AA | High | Light `karaoke-muted` on stage: **~4.47:1** (fails normal text) | `index.css` |
| **1.4.3** | AA | High | Dark `karaoke-muted` on stage: **~3.41:1** | `index.css` |
| **1.4.3** | AA | High | Amber unsynced warning `text-amber-500/90`: **~2.05:1** on light stage | `lyrics-stage.tsx` |
| **1.4.1** Use of Color | A | Medium | Active line relies heavily on color + opacity; size/scale help sighted users but AT gets no progress | `lyric-line.tsx` |
| **2.1.1** Keyboard | A | **Critical** | Motion `whileTap`/`whileHover` injects `tabindex="0"` on decorative spans — unnamed ghost stops | `animated-icon.tsx` |
| **2.1.1** | A | High | YouTube iframe in tab order before app controls | DOM order + embed |
| **2.1.1** | A | High | Hidden-video iframe may remain focusable despite `aria-hidden` ancestor | `youtube-panel.tsx` |
| **2.1.1** | A | Medium | Each lyric line is a `<button>` — potentially hundreds of tab stops | `lyric-line.tsx` |
| **2.4.1** Bypass Blocks | A | Medium | No skip-to-main / skip-to-lyrics link | `app-shell.tsx` |
| **2.4.3** Focus Order | A | High | iframe → then Home/transport; lyrics after long iframe traversal | `player-page.tsx` |
| **2.4.6** Headings | AA | Medium | Player lacks descriptive heading (song title) | `player-page.tsx` |
| **2.4.7** Focus Visible | AA | Low | Ghost spans may show weak/no meaningful focus ring | `animated-icon.tsx` |
| **2.5.3** Label in Name | A | Medium | Theme control `aria-label="Toggle theme"` opens menu, doesn't toggle | `mode-toggle.tsx` |
| **3.2.2** On Input | A | Medium | Paste auto-navigates to player without explicit submit | `url-input.tsx` |
| **3.3.2** Labels or Instructions | A | High | No visible "YouTube URL" label | `url-input.tsx` |
| **4.1.2** Name, Role, Value | A | Medium | Seek slider: no `aria-valuetext` (e.g. "1:23 of 3:45"); exposed as `readonly` in a11y tree | `transport-controls.tsx` |
| **4.1.2** | A | Low | Sync offset numeric display not programmatically linked to ± buttons | `transport-controls.tsx` |
| **4.1.3** Status Messages | AA | **Critical** | Active lyric changes not announced; loading/error partially covered | `lyrics-stage.tsx` |
| **4.1.3** | AA | Medium | "Translating…", playback state changes not in live region | `player-page.tsx` |

### Passes / partial passes

- **1.3.1** — `LyricsRetry` uses proper `<label>` wrappers
- **3.3.1** — URL errors: `aria-invalid`, `aria-describedby`, `role="alert"`
- **4.1.2** — Play/pause, sync, video toggle, shortcuts trigger have `aria-label`
- **2.4.7** — Buttons/links/lyric lines use `focus-visible:ring-2`
- **Reduced motion (partial)** — `motion-reduce:animate-none` on skeletons; `MotionConfig reducedMotion="user"` on lyric lines
- **Dark theme** — active lyric (~8.09:1), muted body text (~6.25:1) pass

---

## 10 inclusive UX fine details

| # | Detail | Status | Notes |
|---|--------|--------|-------|
| 1 | **Lyric line changes announced?** | **No** | No `aria-live`; backlog `FB-a11y-002`. `aria-current="true"` on active button insufficient — SR won't announce on change. |
| 2 | **Seek slider accessible?** | **Partial** | `aria-label="Seek"` present; native range keyboard works. Missing `aria-valuetext`, no announcement on seek via shortcuts. |
| 3 | **Phantom icon focus stops?** | **Fail** | Motion adds `tabindex="0"` to `AnimatedIcon` spans; includes **hidden** Sun icon (`dark:hidden`) still focusable. |
| 4 | **YouTube vs app control order?** | **Fail** | iframe at tab index 4, before Home and transport — karaoke users tab through embed first. |
| 5 | **Hidden video still in tab order?** | **Likely fail** | `aria-hidden` on wrapper; iframe not removed/`inert`. |
| 6 | **Shortcuts discoverability?** | **Weak** | Icon-only `?` in player footer dropdown; no `?` key; not on home; list incomplete vs actual shortcuts. |
| 7 | **`prefers-reduced-motion`?** | **Partial** | Lyric opacity anim respects Motion reducedMotion; **`scrollIntoView({ behavior: "smooth" })` always smooth**; icon spring animations ignore preference. |
| 8 | **Word-level karaoke fill for AT?** | **Hidden** | Progress overlay `aria-hidden`; AT hears full line text only, no "sung so far" cue. |
| 9 | **Paste-to-navigate surprise?** | **Risk** | Immediate route change on valid paste — no confirmation; disorienting for SR users mid-form. |
| 10 | **Document title / context?** | **Static** | `<title>` always `song-kara`; doesn't update with track — SR users lose page context on player. |

**Bonus:** Recent "Clear" has no `aria-label`; header `<a href="/">` full reload vs client `Link`; player "Translate" has visible text (good) but no loading live region.

---

## Recommendations (priority)

### P0 — Karaoke core

1. Add `aria-live="polite"` sr-only region announcing active line on index change (not per-word).
2. Fix light-theme lyric contrast: raise `karaoke-muted` / `karaoke-active` or drop inactive opacity below AA threshold.
3. Set `tabIndex={-1}` on `AnimatedIcon` wrapper or drop `whileTap` on non-interactive icons.
4. When video hidden: `inert` on panel + `tabindex="-1"` on iframe.

### P1 — Keyboard / focus

5. Move iframe after lyrics in DOM or skip link "Skip to lyrics".
6. Rove focus / `aria-activedescendant` on lyric list instead of N buttons.
7. Visible `<label htmlFor>` on URL input.

### P2 — Polish

8. `aria-valuetext` on seek; link sync offset to buttons via `aria-describedby`.
9. `scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" })`.
10. Dynamic `document.title`; rename theme button to "Theme settings".
11. `?` opens shortcuts; surface shortcut hint on home.
12. Add `eslint-plugin-jsx-a11y` + axe in CI.

---

## Test environment notes

- Preview: `http://127.0.0.1:4173`
- Lyrics API didn't populate in automated session — lyric-list tab-order impact inferred from markup.
- YouTube iframe accessibility depends on third-party embed.

---

## Related backlog

- `docs/superpowers/backlog/proposals/FB-a11y-002.md` — live region (matches P0 #1)
- `docs/superpowers/backlog/proposals/FB-a11y-001.md` — font scaling

---

*Auditor: automated code + browser pass. Re-test after fixes with VoiceOver/NVDA and axe DevTools.*
