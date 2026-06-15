# Lyrics UX v2 — Brainstorm & Design

> **Status:** Design only — no implementation in this doc.  
> **Parent plan:** `docs/plans/spotify-style-lyrics-player.md`  
> **Baseline reviewed:** `lyric-line.tsx`, `lyrics-stage.tsx`, `now-playing-header.tsx`, `lrc-parser.ts`, `plain-lyrics-timing.ts`, `lyric-line-visual.ts`

**Goal:** Four targeted UX improvements on top of the Spotify-style player: gaze-aware 3D depth, consistent active-line color, chrome relocation for auto-timed messaging, and structural tag hygiene in parsers.

---

## Summary of recommendations

| # | Feature | Recommendation |
|---|---------|----------------|
| 1 | 3D depth follows look center | **Hybrid:** viewport-center depth for Z/opacity/blur; active index for scale, color, word wipe |
| 2 | Purple active lyric | **Dedicated fixed `--karaoke-highlight` token** — not theme-primary, not per-theme `--karaoke-active` |
| 3 | Auto-timed banner | **Move to `NowPlayingHeader`** as subtitle + `title` tooltip; remove stage block |
| 4 | `[Verse]` / `[Chorus]` tags | **Parse → section markers** (non-singable, zero weight); strip from timing; optional styled chip in stage |

---

## 1. 3D lyrics follow user's look center

### Problem

Today depth is purely **index distance** (`distanceFromActive = i - activeIndex` in `lyrics-stage.tsx`). Scale, opacity, Z, and blur all key off that single number via `getLyricLineVisual()`.

That works when the active line is locked to the viewport center, but breaks perceptually when:

- The user **scrolls manually** to read ahead — a centered line still looks "inactive" (receded).
- **Scroll animation** lags behind index change — the new active line animates forward before it reaches center.
- **Long lines** span vertical space; the user's focal point is the **viewport center**, not the list index.

Karaoke singers look at **where text sits on screen**, not at ordinal position in the array.

### Options considered

| Approach | UX | Perf | Verdict |
|----------|----|------|---------|
| **A. Viewport-center depth** | Lines nearer vertical center of stage appear forward; matches gaze | One `getBoundingClientRect` pass per visible line on scroll/resize (rAF-throttled) | **Recommended (partial)** |
| **B. Index distance only** (current) | Predictable sync with highlight; wrong during manual scroll | Cheapest — no layout reads | Keep for **semantic** cues only |
| **C. Mouse parallax** | Desktop-only novelty | Continuous pointer listeners; useless on TV/phone | **Rejected** — wrong device class |
| **D. Scroll-center tracking** | Same as A if center = scroll anchor | Same as A | Merge into A |
| **E. WebGazer eye tracking** | True gaze | Camera permission, latency, CPU, privacy | **Rejected** — v3+ research only |

### Recommended: hybrid viewport + active index

Split visual channels:

| Channel | Driven by | Rationale |
|---------|-----------|-----------|
| **Scale, color, word wipe, `aria-current`** | Active index | "What you're singing now" — sync semantics |
| **Z translate, opacity falloff, blur** | Viewport distance to stage center | "What you're looking at" — spatial stack |

**Viewport distance function:**

```ts
// Conceptual — src/lib/lyric-viewport-depth.ts
function viewportDistancePx(
  lineEl: HTMLElement,
  stageEl: HTMLElement,
): number {
  const stage = stageEl.getBoundingClientRect()
  const line = lineEl.getBoundingClientRect()
  const stageCenterY = stage.top + stage.height / 2
  const lineCenterY = line.top + line.height / 2
  return Math.abs(lineCenterY - stageCenterY)
}

// Map px distance → 0..1 focus factor (tunable curve)
function focusFactor(px: number, stageHeight: number): number {
  const half = stageHeight / 2
  return Math.max(0, 1 - px / half) // linear; optional ease-out
}
```

**Blend rule for inactive lines:**

```
visual.z      = lerp(farZ, nearZ, focusFactor) * (active ? 1 : 0.85)
visual.opacity = max(indexOpacity, viewportOpacity)
visual.blur   = viewportBlur only (active line always blur 0)
visual.scale  = indexScale only (active bump stays index-driven)
```

Active line always wins: `distance === 0` from index forces `z = ACTIVE_Z`, `opacity = 1`, `blur = 0` regardless of viewport (handles off-center during scroll transition briefly).

### Update strategy (perf)

- **Do not** read layout every animation frame in the rAF sync loop.
- Subscribe to stage `scroll` + `resize` with **rAF throttle** (max 1 read/frame).
- Store `Map<lineIndex, focusFactor>` in React state or a ref consumed by `LyricLine`.
- **Windowing** (when implemented): only measure visible ±8 lines.
- **`prefers-reduced-motion`:** skip viewport reads; fall back to index-only (current behavior).

### Rejected alternatives (detail)

- **Pure viewport depth:** Active line off-center during scroll would lose highlight scale — confusing for sync.
- **Mouse parallax:** Karaoke use is lean-back, hands-free, TV at 2 m; pointer position ≠ gaze.
- **WebGazer:** High setup cost, unreliable in dark venues, GDPR/camera friction; save for experiment flag only.

### Files (Track D — Viewport depth)

| File | Change |
|------|--------|
| `src/lib/lyric-viewport-depth.ts` | **New** — distance math, focus curve, throttle helper |
| `src/lib/lyric-line-visual.ts` | Accept `viewportFocus: number`; blend with index distance |
| `src/components/lyrics-stage.tsx` | Scroll/resize listener, pass `viewportFocus` per line |
| `src/components/lyric-line.tsx` | Wire blended visual (no logic duplication) |
| `tests/lib/lyric-viewport-depth.test.ts` | **New** — pure math fixtures |

**Do not touch:** `plain-lyrics-timing.ts`, `now-playing-header.tsx`, theme tokens.

### Acceptance criteria — viewport depth

- [ ] Manually scrolling so a non-active line sits at stage center: that line appears **more forward** (higher opacity, less blur) than index-equidistant lines at the edges.
- [ ] Active line at center: unchanged or better prominence vs today (scale + purple + wipe).
- [ ] Active line during scroll transition: remains full opacity and active color even if momentarily off-center.
- [ ] `prefers-reduced-motion: reduce`: index-only visuals; no scroll listeners for depth.
- [ ] 80-line song, mid-scroll: no sustained &lt; 55 fps on 6× CPU throttle (layout reads ≤ 1× per frame).
- [ ] No additional Zustand writes per frame.

---

## 2. Purple current lyric (always)

### Problem

Active line uses `text-karaoke-active` (`lyric-line.tsx:89`). That token is **theme-dependent** — `themes.ts` sets different `karaokeActive` per preset (Midnight magenta, Neon Tokyo cyan-adjacent, etc.). Reviews flag **light-mode contrast failure** (~2.67:1) and brand inconsistency when users switch themes mid-song.

User expectation: **active lyric = purple/magenta** — the karaoke affordance — regardless of chrome theme.

### Options considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. Keep `--karaoke-active` per theme** | Theming flexibility | Breaks "always purple"; contrast lottery | **Rejected** |
| **B. Use `--primary` for active line** | One token | Primary varies by theme same problem | **Rejected** |
| **C. Fixed `--karaoke-highlight`** | Brand-consistent; tune contrast once per light/dark **stage** | Slightly less theme expressiveness on active line | **Recommended** |
| **D. Hardcode Tailwind `text-purple-500`** | Simple | No OKLCH; bad dark/light dual | **Rejected** |

### Recommended: dedicated `--karaoke-highlight`

Add a **non-theme-picker** token pair:

```css
/* index.css — not overridden by themes.ts applyTheme() */
:root {
  --karaoke-highlight: oklch(0.48 0.24 320);   /* light stage: ≥ 4.5:1 on --karaoke-stage-bg */
  --karaoke-highlight-glow: oklch(0.48 0.24 320 / 0.42);
}
.dark {
  --karaoke-highlight: oklch(0.78 0.30 320);   /* dark stage: ≥ 7:1 */
  --karaoke-highlight-glow: oklch(0.78 0.30 320 / 0.42);
}
```

**Usage:**

- Active line text: `text-[var(--karaoke-highlight)]` or `@theme` alias `--color-karaoke-highlight`
- Word wipe gradient: `var(--karaoke-highlight)` → `var(--karaoke-unsung)`
- Text shadow glow: `color-mix(in oklch, var(--karaoke-highlight) …)`

**Keep `--karaoke-active` in themes** for previews / future use, but **lyric line no longer reads it**. Theme picker continues to control stage bg, muted, chrome — not the singer's focal color.

**Contrast gate:** CI or test asserts `--karaoke-highlight` on `--karaoke-stage-bg` ≥ 4.5:1 (light) and ≥ 3:1 large text minimum.

### Files (Track E — Highlight token)

| File | Change |
|------|--------|
| `src/index.css` | Add `--karaoke-highlight`, Tailwind color alias |
| `src/components/lyric-line.tsx` | Switch active color + wipe + shadow to highlight token |
| `src/components/theme-preview-mini.tsx` | Show highlight on active preview line (consistency) |
| `tests/lib/themes.test.ts` | Assert `applyTheme()` does **not** clobber `--karaoke-highlight` |
| `tests/lib/lyric-contrast.test.ts` | **New** (optional) — contrast ratio smoke |

**Do not touch:** viewport depth, parsers, header layout.

### Acceptance criteria — purple active

- [ ] Active line color identical hue family (≈320°) across all theme presets in theme picker.
- [ ] Light + dark: active line contrast ≥ 4.5:1 against `--karaoke-stage-bg` (WCAG AA).
- [ ] Word wipe uses same highlight token as line text.
- [ ] Inactive lines still use `--karaoke-muted` (themeable).
- [ ] Theme preview mini shows purple active line even when theme primary is non-purple.

---

## 3. Move auto-timed banner to top bar

### Problem

`lyrics-stage.tsx` renders a centered warning block above the lyric list (`!lyricsSynced`, lines 140–164):

> Auto-timed from plain lyrics — syllable-weighted estimate. Use ±0.5s below to adjust.

This **consumes vertical stage space**, competes with the focal lyric stack, and duplicates information already partially shown as the **"Auto-timed"** badge in `now-playing-header.tsx`.

### Options considered

| Approach | Verdict |
|----------|---------|
| **A. Remove entirely** — badge only | **Rejected** — users need offset hint once |
| **B. Toast on first auto-timed load** | **Rejected** — ephemeral; easy to miss |
| **C. Header subtitle + tooltip** | **Recommended** |
| **D. Transport bar footnote** | **Rejected** — transport already dense; offset controls are there but context belongs with track metadata |

### Recommended: `NowPlayingHeader` contextual subtitle

When `status === "ready"` && `!lyricsSynced` && `lyrics.length > 0`:

| `lyricsAutoTimed` | Badge (existing) | New subtitle (second row, `text-xs text-muted-foreground`) |
|-------------------|------------------|-------------------------------------------------------------|
| `true` | Auto-timed | Syllable-weighted estimate — use ±0.5s in transport to adjust |
| `false` | Approximate | Timing is approximate — use ±0.5s in transport to adjust |

**Presentation:**

- Single line under title row; truncates with `title` attribute for full text.
- `role="status"` on subtitle (header already has badge status).
- **Remove** the `AlertTriangle` block from `lyrics-stage.tsx` entirely.
- Optional: `Info` icon (muted) with `aria-label` — no amber warning styling (this is informational, not an error).

### Files (Track F — Banner move)

| File | Change |
|------|--------|
| `src/components/now-playing-header.tsx` | Subtitle row, conditions, a11y |
| `src/components/lyrics-stage.tsx` | Delete unsynced banner block (~lines 140–165) |

**Do not touch:** parsers, motion, theme tokens.

### Acceptance criteria — banner

- [ ] Auto-timed plain lyrics: **no** banner above lyric list; subtitle visible in header.
- [ ] Approximate (non-auto-timed) unsynced: subtitle variant shown; no stage banner.
- [ ] Synced LRC: no subtitle, badge = "Synced".
- [ ] Mobile 375px: subtitle wraps or truncates gracefully; header ≤ 3 lines total.
- [ ] Stage vertical space reclaimed — active line can sit higher (visual check).
- [ ] Screen reader announces subtitle once (no duplicate with badge).

---

## 4. Better `[Verse]` / `[Chorus]` tag parsing

### Problem

`parsePlainLyrics` and `parseLrc` treat every non-empty row as a singable `LyricLine`. Provider plain text often includes structural tags:

```
[Verse 1]
First line of verse
[Chorus]
Hook line here
```

Today `[Verse 1]` becomes a timed line with nonsense weight (bracket words syllable-heuristic), pollutes the stage, and breaks singer trust.

### Options considered

| Approach | Verdict |
|----------|---------|
| **A. Strip silently** | **Partial** — OK for timing; loses section context |
| **B. Strip + section metadata** | **Recommended** |
| **C. Style as full lyric line (muted)** | **Rejected** — still gets seek button and timing slot |
| **D. Leave raw** | **Rejected** — current bug |

### Recommended: parse → `LyricSection` markers

**Detection regex** (plain + LRC text after timestamp peel):

```ts
const STRUCTURAL_TAG =
  /^\s*\[(?:verse|chorus|bridge|intro|outro|pre-?chorus|hook|refrain|interlude|instrumental)(?:\s+\d+)?\]\s*$/i
```

Also accept common variants: `[Verse 2]`, `[CHORUS]`, `[Bridge]`.

**Extended model** (`src/types/lyrics.ts`):

```ts
export type LyricRow =
  | { kind: "line"; startMs: number; endMs: number; text: string }
  | { kind: "section"; label: string } // e.g. "Verse 2"

export type ParsedLyrics = {
  rows: LyricRow[]
  lines: LyricLine[]        // derived: rows where kind === "line" (backward compat)
  synced: boolean
  autoTimed?: boolean
}
```

**Parser pipeline:**

1. Split raw text into rows (preserve order).
2. Classify each row: `section` vs `line` (LRC: tag-only timestamps still section).
3. **Timing:** `estimatePlainLyricsTiming` receives **lines only** — sections never get weight or duration.
4. **Stage render:** `lyrics-stage` maps `rows` — sections render as `<p class="text-xs uppercase tracking-wide text-muted-foreground">` between buttons; **not** focusable, not in `getActiveLineIndex`.

**LRC synced path:** Section tags without singable text are metadata only; if `[00:12.00][Chorus]` appears, treat as section marker at that time (optional seek anchor to section start — P2).

**Weight fix:** `estimateLineWeight("[Verse 2]")` should never run — filter before weight array.

### Strip vs display default

| User-facing | Default |
|-------------|---------|
| Plain karaoke singer | **Show styled section chip** (helps "where am I in the song") |
| Timing / sync algo | **Always exclude** |

Setting `showSectionLabels: boolean` in player-store (default `true`) — P1; v1 can always show.

### Files (Track G — Structural tags)

| File | Change |
|------|--------|
| `src/types/lyrics.ts` | `LyricRow`, extend `ParsedLyrics` |
| `src/lib/lyric-section-parser.ts` | **New** — `isStructuralTag`, `splitLyricRows` |
| `src/lib/lrc-parser.ts` | Integrate classifier; export lines-only for sync |
| `src/lib/plain-lyrics-timing.ts` | Accept pre-filtered lines; document exclusion |
| `src/components/lyrics-stage.tsx` | Render section rows (non-interactive) |
| `src/lib/sync-engine.ts` | `getActiveLineIndex` unchanged (operates on `lines[]`) |
| `tests/lib/lyric-section-parser.test.ts` | **New** |
| `tests/lib/lrc-parser.test.ts` | Tags stripped from lines; sections in rows |
| `tests/lib/plain-lyrics-timing.test.ts` | `[Chorus]` does not consume duration budget |

**Do not touch:** viewport depth, highlight token, header.

### Acceptance criteria — structural tags

- [ ] `[Verse 2]` never appears as a clickable lyric line.
- [ ] Plain auto-timing: section tag rows do not receive `startMs`/`endMs`.
- [ ] Line after `[Chorus]` is timed identically whether or not tag row is present (minus gap).
- [ ] Stage shows optional section label (uppercase muted) above following verse.
- [ ] LRC with inline tags: singable text extracted; tags not in wipe target.
- [ ] `getActiveLineIndex` indices match singable lines only (no off-by-one).
- [ ] Cached lyrics (`lyrics-cache.ts`) round-trip `rows` or re-derive consistently.

---

## Parallel implementation tracks

Four tracks with **minimal overlap**. Phase 0 shared contract recommended before G (types).

```
Phase 0 (1 PR, ~30 min)
  types/lyrics.ts — LyricRow union (Track G needs this; others can wait)

Track D — Viewport depth     │ Track E — Highlight token
  lyric-viewport-depth.ts    │   index.css, lyric-line.tsx
  lyric-line-visual.ts       │   theme-preview-mini.tsx
  lyrics-stage.tsx           │
                             │
Track F — Banner move        │ Track G — Section tags
  now-playing-header.tsx     │   lyric-section-parser.ts
  lyrics-stage.tsx (delete)  │   lrc-parser.ts, plain-lyrics-timing.ts
                             │   lyrics-stage.tsx (render rows)
```

### Conflict matrix

|        | D | E | F | G |
|--------|---|---|---|---|
| **lyrics-stage.tsx** | ✓ | — | ✓ | ✓ |
| **lyric-line.tsx** | ✓ | ✓ | — | — |
| **index.css** | — | ✓ | — | — |
| **lrc-parser.ts** | — | — | — | ✓ |

**Merge order:** E and F first (small). D and G next. **lyrics-stage.tsx** conflicts: G adds row rendering; D adds scroll listener; F removes banner — **sequence F → G → D** or one owner for stage.

### Agent briefs (copy-paste)

**Agent D — Viewport depth**  
Implement hybrid depth per §1. New `lyric-viewport-depth.ts`. Blend in `getLyricLineVisual`. rAF-throttle scroll reads. Reduced motion = index-only fallback.

**Agent E — Highlight token**  
Add `--karaoke-highlight` to `index.css`; wire `lyric-line.tsx` + preview. Do not map in `themes.ts` TOKEN_CSS_MAP. Add contrast test.

**Agent F — Header banner**  
Move unsynced copy to `now-playing-header.tsx`; delete stage banner. Badge + subtitle must not duplicate awkwardly.

**Agent G — Section tags**  
New parser module; extend types; filter before `estimatePlainLyricsTiming`; render section chips in stage. Backward-compat `lines` array for sync engine.

---

## Test plan (cross-track)

| ID | Track | Steps | Expected |
|----|-------|-------|----------|
| T-01 | D | Scroll inactive line to center | Forward depth vs edge lines |
| T-02 | D | OS reduced motion | No viewport listener; index-only |
| T-03 | E | Switch themes on player | Active line stays purple |
| T-04 | E | Light mode screenshot | Contrast ≥ 4.5:1 |
| T-05 | F | Load auto-timed song | Subtitle in header; empty stage top |
| T-06 | F | Synced LRC | No unsynced subtitle |
| T-07 | G | Paste lyrics with `[Verse 1]` | Chip visible; not singable |
| T-08 | G | Auto-time with tags | Fewer timed lines than raw rows |
| T-09 | All | `npm test && npm run build` | Green |

---

## Out of scope (v2)

- WebGazer / camera gaze tracking
- Mouse parallax
- Draggable PiP (layout track)
- Section seek anchors in LRC (P2)
- `showSectionLabels` user pref (P1)

---

## References

- `docs/plans/spotify-style-lyrics-player.md` — §2 3D focus, §3 plain sync
- `docs/reviews/visual-polish-audit.md` — contrast, `--karaoke-active`
- `docs/reviews/ux-journey-audit.md` — venue readability, header context

*Brainstorm authored 2026-06-15. Docs only — implementation follows in separate PRs.*
