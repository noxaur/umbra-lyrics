# Spotify-Style Lyrics Player — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Three parallel tracks below — **do not cross file ownership** without coordination.

**Goal:** Upgrade the lyrics player to Spotify / Musixmatch quality: viewport-filling stage with always-visible transport, 3D focus animations on the active line, and a syllable-aware auto-sync algorithm for plain (unsynced) lyrics.

**Architecture:** Split into three isolated workstreams — **Layout shell** (page structure + sticky chrome), **Motion stage** (3D lyric focus + scroll discipline), **Sync engine** (plain-lyrics timing). Shared contracts live in `types/lyrics.ts` and `player-store.ts`; each stream owns its vertical slice of files.

**Tech stack:** React 19, Tailwind v4 (`index.css` tokens), Motion (`motion/react`), Zustand, Vitest.

**Baseline (current state):**

| Area | Today | Gap |
|------|-------|-----|
| Layout | Side-by-side split (`lg:flex-row`); transport at bottom of lyrics column, scrolls away | Controls below fold on mobile / long lyrics |
| Video | Full `aspect-video` column or `h-0` when hidden | No PiP; dead black space below embed on tall viewports |
| Active line | `scale-[1.02]`, size clamp, word wipe | No depth stack, no distance-based fade/blur |
| Plain sync | `parsePlainLyrics`: `durationMs / lineCount` equal slices | Ignores syllables, verse gaps, chorus structure |
| Scroll | `scrollIntoView({ block: "center" })` when outside center third | Still scroll-dependent for transport visibility |

**Reviews informing this plan:** `docs/reviews/ux-journey-audit.md`, `docs/reviews/karaoke-singer-ux.md`, `docs/reviews/visual-polish-audit.md`.

---

## Target UX (reference)

Spotify / Musixmatch patterns to match:

1. **Lyrics dominate the viewport** — video is secondary (corner PiP or thin top strip).
2. **Active line is the focal plane** — largest, brightest, slightly forward; neighbors recede in scale, opacity, and blur.
3. **Transport never requires scrolling** — play/pause/seek always visible (sticky bottom bar or safe-area inset).
4. **Plain lyrics feel musical** — line changes land near phrase boundaries, not arbitrary equal slices.
5. **Reduced motion** — instant scroll, no blur, opacity-only transitions.

---

## 1. Layout — No Scroll to Play

### 1.1 Design

```
┌─────────────────────────────────────────────────────────────┐
│  [App header — optional collapse in Focus mode]             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  Now Playing: Track · Artist  [Synced]    │  ← compact strip (optional)
│  │  video PiP   │                                           │
│  │  16:9 mini   │                                           │
│  └──────────────┘                                           │
│                                                             │
│              ╔═══════════════════════════╗                  │
│              ║   ACTIVE LINE (center)      ║  ← lyrics stage │
│              ╚═══════════════════════════╝                  │
│                 next line (dim)                             │
│                 prev line (dim)                             │
│                                                             │
│  (flex-1 min-h-0 overflow-hidden — stage scrolls internally)│
├─────────────────────────────────────────────────────────────┤
│  [ ▶ ] ────●──────── 1:24 / 3:45   Timing  Display  ?      │  ← STICKY transport
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Layout contract

Introduce a **player viewport shell** that owns height math:

```tsx
// Conceptual structure (player-page.tsx)
<div className="flex min-h-0 flex-1 flex-col">
  <PlayerChrome />           {/* now-playing + nav — shrink-0 */}
  <div className="relative flex min-h-0 flex-1 flex-col">
  <VideoOverlay />           {/* PiP or top strip — absolute, pointer-events-auto */}
  <LyricsStage className="flex-1 min-h-0" />  {/* internal scroll only */}
  </div>
  <TransportControls className="sticky bottom-0 z-20 shrink-0" />
</div>
```

**Key CSS rules:**

| Rule | Rationale |
|------|-----------|
| `min-h-0` on flex children | Allows inner scroll without page scroll |
| `sticky bottom-0` + `z-20` on transport | Always visible above stage |
| `env(safe-area-inset-bottom)` padding on transport | iOS home indicator |
| `h-svh` or `100dvh` on player root | Mobile browser chrome stability |
| Stage: `overflow-y-auto overscroll-y-contain` | Lyrics scroll inside stage only |

### 1.3 Video modes

| Mode | Desktop | Mobile | Trigger |
|------|---------|--------|---------|
| **PiP** (default) | `absolute top-3 right-3 w-[min(28vw,320px)] aspect-video rounded-lg shadow-lg` | `top-2 right-2 w-[40vw] max-w-[200px]` | `!videoHidden` |
| **Strip** (optional) | Full-width `h-[120px]` crop center | Same, shorter `h-[80px]` | User pref / `videoLayout: "strip"` |
| **Hidden** | No DOM footprint (keep iframe mounted offscreen for audio) | Same | `videoHidden` |

**Implementation notes:**

- Refactor `player-page.tsx`: remove `lg:flex-row` split; single column lyrics-first.
- `YouTubePanel` → `VideoOverlay` with `variant: "pip" | "strip" | "hidden"`.
- Keep iframe mounted when hidden (current behavior) — move to `fixed -left-[9999px] w-px h-px` or `sr-only` container so audio continues.
- **Focus mode** (stretch goal): `player-store.focusMode` hides app header + breadcrumb; PiP auto-hides after 5s idle; transport compacts to play + time.

### 1.4 Files (Layout track)

| File | Change |
|------|--------|
| `src/pages/player-page.tsx` | New column layout, viewport shell, wire `VideoOverlay` |
| `src/components/youtube-panel.tsx` | Rename/extend → `video-overlay.tsx` with PiP/strip variants |
| `src/components/transport-controls.tsx` | Sticky positioning, optional compact variant |
| `src/components/app-shell.tsx` | Optional `hideHeader` prop for focus mode |
| `src/index.css` | `--player-transport-h`, safe-area utilities, PiP shadow tokens |
| `src/stores/player-store.ts` | `videoLayout`, `focusMode` (optional) |

### 1.5 Acceptance criteria — Layout

- [ ] On iPhone SE viewport (375×667), play button visible without scrolling at any lyrics scroll position.
- [ ] On 1080p desktop, transport visible with 60+ line song scrolled to middle.
- [ ] Video PiP draggable **not required** v1; fixed corner OK.
- [ ] Hide video removes PiP; lyrics stage expands to full width; no layout jump > 100ms.
- [ ] `prefers-reduced-motion`: no layout transition animations.

### 1.6 Test cases — Layout

| ID | Steps | Expected |
|----|-------|----------|
| L-01 | Load player, 50 lines, scroll stage to bottom | Transport still visible, clickable |
| L-02 | Mobile DevTools, `videoHidden=true` | Full-width stage, no PiP, transport visible |
| L-03 | Resize 320→1920 | PiP scales within bounds, stage fills remaining space |
| L-04 | `focusMode` on (if implemented) | Header hidden, stage + transport only |

---

## 2. 3D / Focus Animations

### 2.1 Visual model

Each line receives a **focus distance** `d = |i - activeIndex|` (inactive before first line: all `d = i + 1` or large constant).

| Distance `d` | Scale | Opacity | Blur | Z translate | Font |
|--------------|-------|---------|------|-------------|------|
| 0 (active) | 1.0 | 1.0 | 0 | 0 | `clamp(1.75rem, 5vw, 4rem)` |
| 1 | 0.92 | 0.75 | 0.5px | -12px | `clamp(1.25rem, 3.5vw, 2rem)` |
| 2 | 0.85 | 0.55 | 1px | -24px | same |
| 3+ | 0.78 | 0.35 | 2px | -36px | same |
| ≥6 | 0.72 | 0.25 | 3px | -48px | optional: hide text |

**Perspective container** (on stage inner wrapper):

```css
.lyrics-stage-3d {
  perspective: 1200px;
  perspective-origin: center center;
}
```

### 2.2 Motion implementation

Use **variants keyed by focus distance**, not per-line `layout` (avoids jank on long songs — per `karaoke-singer-ux.md`).

```tsx
// src/lib/lyric-motion.ts
export const lineVariants = {
  active: {
    scale: 1,
    opacity: 1,
    z: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 400, damping: 35 },
  },
  near: {
    scale: 0.92,
    opacity: 0.75,
    z: -12,
    filter: "blur(0.5px)",
    transition: { type: "spring", stiffness: 400, damping: 35 },
  },
  // far, distant ...
}

export function variantForDistance(d: number): keyof typeof lineVariants { ... }
```

**Framer Motion patterns to use:**

| Pattern | Application |
|---------|-------------|
| `variants` + `custom={d}` | Distance-based animation state |
| `MotionConfig reducedMotion="user"` | Already in `lyric-line.tsx` — keep |
| `useReducedMotion()` | Disable blur + Z; opacity/scale only |
| `layout="position"` on container only | **Not** on every line |
| `layoutScroll` on stage ref | Smooth scroll-linked position (if needed) |

**Reduced-motion fallback:**

```tsx
const reduce = useReducedMotion()
const variant = reduce
  ? { active: { opacity: 1 }, inactive: { opacity: 0.5 } }
  : lineVariants[variantForDistance(d)]
```

### 2.3 Scroll discipline

Keep `isOutsideCenterThird` gate (`lyric-scroll.ts`). Enhancements:

- Default `behavior: "auto"` (instant); `smooth` only when `!prefers-reduced-motion` **and** user has not enabled "Reduce scroll" setting.
- **Windowing** (P1): render `activeIndex ± 8` lines in DOM for 100+ line songs; spacer divs for height. Reduces Motion node count.

### 2.4 Word highlight (synced only)

| `lyricsSynced` | Behavior |
|----------------|----------|
| `true` | Keep `WordProgressText` gradient wipe |
| `false` | **Line-level highlight only** — no wipe (misleading for approximate timing) |

Fix a11y duplication: single text node + `aria-hidden` decorative progress bar, or `aria-live="off"` on progress span.

### 2.5 Bilingual in focus stack

When `displayMode === "both"`: English line inherits distance fade but **min font** `clamp(1rem, 2.5vw, 1.35rem)` when active; scale English to 0.85× native when inactive.

### 2.6 Files (Motion track)

| File | Change |
|------|--------|
| `src/lib/lyric-motion.ts` | **New** — variants, distance helpers, reduced-motion merge |
| `src/components/lyric-line.tsx` | 3D transforms, variant animate, conditional word wipe |
| `src/components/lyrics-stage.tsx` | Perspective wrapper, pass `distance`, windowing (P1) |
| `src/index.css` | `.lyrics-stage-3d`, tokenized opacity floors for light mode |
| `tests/components/lyric-line.test.tsx` | Variant selection, reduced-motion, unsynced no-wipe |

### 2.7 Acceptance criteria — Motion

- [ ] Active line visually largest at all breakpoints; inactive lines monotonically decrease in prominence with distance.
- [ ] Line change animates < 300ms perceived (spring settles without bounce overshoot > 4px).
- [ ] `prefers-reduced-motion: reduce` → no blur, no Z, opacity step only, instant scroll.
- [ ] 80-line song: no visible frame drops on mid-tier mobile (target 55fps+ during line change).
- [ ] Unsynced lyrics: no word wipe; active line still gets focus treatment.

### 2.8 Test cases — Motion

| ID | Steps | Expected |
|----|-------|----------|
| M-01 | Toggle active line via seek | Scale/opacity animate smoothly |
| M-02 | Enable reduced motion in OS | No blur/filter in computed styles |
| M-03 | `lyricsSynced=false` | No gradient wipe on active line |
| M-04 | Fast seek through chorus | No layout thrash; active ref follows |
| M-05 | `displayMode=both` | English readable when active (≥ 16px effective) |

---

## 3. Auto-Sync Algorithm (Plain Lyrics)

### 3.1 Problem statement

`parsePlainLyrics` (`lrc-parser.ts:39-54`) assigns equal time slices:

```
slice = durationMs / lineCount
line[i].startMs = i * slice
```

This ignores musical phrasing, syllable weight, blank lines (verse gaps), and chorus repetition. Singers experience lyrics "running ahead" of slow verses and "lagging" on fast choruses.

**Goal:** Produce `LyricLine[]` with `synced: false` but **musically plausible** `startMs`/`endMs` from plain text + track duration, without audio analysis.

### 3.2 Inputs

| Input | Source | Required |
|-------|--------|----------|
| `durationMs` | YouTube `duration` | Yes |
| `lines[]` | Plain lyrics split by `\n`, trimmed, empty dropped | Yes |
| `introMs` | Heuristic or user offset | No (default 0) |
| `outroMs` | `durationMs - lastLineEnd` reserve | No (default 5% or 8s max) |
| `silenceGaps[]` | Detected from blank lines in source text | Derived |
| `syllableWeights[]` | Per-line weight | Derived |
| `wordTimestamps` | Future: aligned transcript | No (v2) |

### 3.3 Syllable weight function

Approximate syllables without NLP dependencies (CJK-aware):

```
function lineWeight(text: string): number {
  if (!text.trim()) return 0

  // CJK: count non-punctuation codepoints as syllable proxies
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)
  if (cjk && cjk.length / text.length > 0.3)
    return cjk.length * 1.2

  // Latin: vowel-group heuristic
  const words = text.trim().split(/\s+/)
  let syllables = 0
  for (const w of words) {
    const groups = w.toLowerCase().match(/[aeiouyáéíóúàèìòùäöü]+/g)
    syllables += Math.max(1, groups?.length ?? 1)
  }

  // Punctuation pause bonus (phrase boundary)
  const pauseBonus =
    (/[.!?…]$/.test(text) ? 1.4 :
     /[,;:]$/.test(text) ? 1.15 : 1.0)

  // Length floor so empty-looking lines don't collapse
  return Math.max(1, syllables * pauseBonus)
}
```

**Complexity:** O(total chars) per parse — negligible.

### 3.4 Verse gap detection

When parsing raw text **before** line array:

```
rawParagraphs = text.split(/\n\s*\n/)   // blank-line boundaries
for each paragraph:
  emit lines from paragraph
  if not last paragraph:
    mark GAP after last line of paragraph (gapMs candidate)
```

**Gap budget:** Distribute up to `min(0.15 * durationMs, 45000)` across inter-verse gaps equally, subtract from singable window.

### 3.5 Singable window

```
introMs   = clamp(0.08 * durationMs, 0, 30000)   // instrumental intro heuristic
outroMs   = clamp(0.05 * durationMs, 3000, 20000)
gapTotal  = sum(gapDurations)
singable  = durationMs - introMs - outroMs - gapTotal
```

### 3.6 Weighted distribution (v1 algorithm)

**Primary approach:** syllable-weighted allocation within singable window.

```
weights[i] = lineWeight(lines[i].text)
W = sum(weights)
cursor = introMs

for i in 0..n-1:
  if line[i] is GAP_MARKER:
    cursor += gapDurations[g++]
    continue

  share = (weights[i] / W) * singable
  // Min/max clamp per line
  share = clamp(share, minLineMs, maxLineMs)

  lines[i].startMs = round(cursor)
  cursor += share
  lines[i].endMs = round(cursor)

  if gap after line i:
    cursor += gapDuration[i]

// Fix drift: scale last 20% of lines so final endMs = durationMs - outroMs
normalizeTail(lines, targetEnd)
```

**Suggested constants:**

| Constant | Value | Rationale |
|----------|-------|-----------|
| `minLineMs` | 1200 | Short exclamations ("Yeah!") |
| `maxLineMs` | 12000 | Slow ballad line cap |
| `minGapMs` | 2000 | Verse pause |
| `maxGapMs` | 12000 | Long instrumental |

### 3.7 Chorus / repeated line detection (v1.5)

Detect lines with identical normalized text (strip punctuation, lowercase):

```
groups = map normalizedText → [indices]
for each group with |indices| >= 2:
  // lock relative spacing: second occurrence should start
  // ~same phase offset as first if timestamps were known
  // without audio: assume chorus fits same duration as first pass
  averageDuration = mean(end-start for first half of group)
  redistribute group lines to averageDuration
```

This prevents chorus lines from getting fresh oversized slots.

### 3.8 Dynamic programming alignment (v2 — word timestamps)

When `wordTimestamps: { word, startMs, endMs }[]` available (future transcript):

```
// Align lines to word sequence via DP (classic DTW variant)
// State: lineIndex, wordIndex
// Cost: time gap penalty + unmatched word penalty
// Result: startMs per line from first aligned word

function alignLinesToWords(lines, words):
  n = lines.length, m = words.length
  dp = array[n+1][m+1] = INF
  dp[0][0] = 0
  for i in 0..n:
    for j in 0..m:
      if i < n and j < m and lineMatches(lines[i], words[j]):
        dp[i+1][j+1] = min(dp[i+1][j+1], dp[i][j])
      if j < m:
        dp[i][j+1] = min(dp[i][j+1], dp[i][j] + skipWordCost)
      ...
  backtrack for start indices
```

**Complexity:** O(n·m) — acceptable for n<100, m<500.

**Integration point:** `sync-engine.ts` exports `getActiveLineIndex` unchanged; new module `plain-sync.ts` replaces `parsePlainLyrics` internals.

### 3.9 Edge cases

| Case | Handling |
|------|----------|
| **Instrumental intro** | `introMs` — no active line (`activeIndex=-1`); stage shows "♪ Intro ♪" until `lines[0].startMs` (P1 UI) |
| **Instrumental outro** | After last line `endMs`, clear active; optional "♪ Outro ♪" |
| **Very short lines** (`"Yeah!"`) | `minLineMs` floor |
| **Very long lines** (rap verse) | `maxLineMs` cap + split on `;` or em-dash if > 80 chars (optional) |
| **Repeated chorus** | Section 3.7 grouping |
| **Blank lines in source** | Verse gaps |
| **durationMs = 0** | Fall back to equal distribution (current behavior) |
| **Single line** | `startMs = introMs`, `endMs = durationMs - outroMs` |
| **LRC available** | Skip plain sync entirely — `parseLrc` path unchanged |

### 3.10 Pseudocode (complete v1)

```text
function parsePlainLyricsV2(text: string, durationMs: number): ParsedLyrics
  if durationMs <= 0 or text is empty
    return parsePlainLyricsLegacy(text, durationMs)  // equal slices

  paragraphs, gapMarkers = splitParagraphs(text)
  lines = flatten(paragraphs)
  if lines.length == 0 return { lines: [], synced: false }

  introMs = clamp(durationMs * 0.08, 0, 30000)
  outroMs = clamp(durationMs * 0.05, 3000, 20000)
  gapBudget = min(durationMs * 0.15, 45000)
  gapMs = gapMarkers.length > 0 ? gapBudget / gapMarkers.length : 0

  singable = durationMs - introMs - outroMs - gapBudget
  weights = lines.map(lineWeight)
  W = sum(weights)

  cursor = introMs
  result = []
  gapIdx = 0

  for i = 0 to lines.length - 1
    share = (weights[i] / W) * singable
    share = clamp(share, MIN_LINE_MS, MAX_LINE_MS)
    start = round(cursor)
    cursor += share
    end = round(cursor)
    result.push({ startMs: start, endMs: end, text: lines[i] })

    if gapAfter(i)
      cursor += gapMs
      gapIdx++

  normalizeTail(result, durationMs - outroMs)
  applyChorusLocking(result)

  return { lines: result, synced: false }
```

**Complexity:** O(n) for distribution + O(n) for chorus grouping → **O(n)** time, O(n) space.

### 3.11 Integration points

| Location | Change |
|----------|--------|
| `src/lib/plain-sync.ts` | **New** — `lineWeight`, `parsePlainLyricsV2`, chorus lock, tests |
| `src/lib/lrc-parser.ts` | `parsePlainLyrics` delegates to `parsePlainLyricsV2` |
| `src/lib/sync-engine.ts` | Add `getSectionState(timeMs, lines)` → `"intro" \| "verse" \| "gap" \| "outro"` for UI placeholders |
| `src/lib/sync-engine.ts` | Add `getGapLines(lines)` → indices where `endMs - startMs` is gap marker |
| `player-page.tsx` | No change (uses `parsePlainLyrics` via `applyLyricsText`) |
| `tests/lib/plain-sync.test.ts` | **New** — golden cases |

### 3.12 Acceptance criteria — Sync

- [ ] Same plain lyrics + duration: deterministic output across runs.
- [ ] Longer lines receive ≥ proportionally more time than short lines (syllable test).
- [ ] Blank-line-separated verses have ≥ 2s pause between sections.
- [ ] Total timeline: `lines[0].startMs >= introMs`, `lines[last].endMs <= durationMs`.
- [ ] LRC path unchanged — `synced: true` when timestamps present.
- [ ] `getActiveLineIndex` tests still pass without modification.

### 3.13 Test cases — Sync

| ID | Fixture | Assertion |
|----|---------|-----------|
| S-01 | 4 lines, equal syllables, 240s, no gaps | Each line ~60s ± 10% |
| S-02 | 2 short + 2 long lines (2× syllables), 120s | Long lines ~1.6× short line duration |
| S-03 | Verse\n\nVerse (blank line) | Gap between verses ≥ 2s |
| S-04 | Chorus repeated 3× (identical text) | Chorus line durations within 15% of first occurrence |
| S-05 | `durationMs=0` | Falls back to equal slices |
| S-06 | 1 line, 180s | Spans intro→outro window |
| S-07 | Rap line 120 chars | Capped at `maxLineMs` |

---

## 4. Parallel Implementation Phases

Three implementers (**A**, **B**, **C**) work in parallel after shared contracts are merged (Day 0, ~1 hour — lead merges types only).

### Phase 0 — Contracts (sequential, 1 PR)

| File | Owner | Content |
|------|-------|---------|
| `src/types/lyrics.ts` | Lead | Optional `LyricSectionState`, `VideoLayout` types |
| `src/stores/player-store.ts` | Lead | `videoLayout?: "pip" \| "strip"`, `fontScale?: "sm"\|"md"\|"lg"\|"xl"` stubs |

**Gate:** Types compile; no UI changes.

---

### Track A — Layout Shell

**Owner:** Implementer A  
**Duration:** ~2–3 days  
**Depends on:** Phase 0

| File | Exclusive ownership |
|------|---------------------|
| `src/pages/player-page.tsx` | ✓ |
| `src/components/video-overlay.tsx` | ✓ (new, replaces panel usage) |
| `src/components/youtube-panel.tsx` | ✓ (deprecate or re-export) |
| `src/components/app-shell.tsx` | ✓ (focus mode header) |
| `src/components/transport-controls.tsx` | ✓ (sticky only — no motion changes) |
| `src/index.css` | ✓ (layout tokens only: `--player-transport-h`, safe-area) |

**Do not touch:** `lyric-line.tsx`, `lyrics-stage.tsx` (except passing `className`), `plain-sync.ts`, `sync-engine.ts`.

**Deliverables:**

1. Single-column lyrics-first layout.
2. PiP video overlay.
3. Sticky transport with safe-area.
4. All layout acceptance tests (L-01–L-04).

**Merge order:** First (lowest conflict risk).

---

### Track B — Motion Stage

**Owner:** Implementer B  
**Duration:** ~2–3 days  
**Depends on:** Phase 0; rebase after Track A merges

| File | Exclusive ownership |
|------|---------------------|
| `src/lib/lyric-motion.ts` | ✓ (new) |
| `src/components/lyric-line.tsx` | ✓ |
| `src/components/lyrics-stage.tsx` | ✓ |
| `src/lib/lyric-scroll.ts` | ✓ |
| `src/index.css` | ✓ (motion tokens only: perspective, karaoke contrast fixes) |
| `tests/components/lyric-line.test.tsx` | ✓ |

**Do not touch:** `player-page.tsx` structure, `plain-sync.ts`, `transport-controls.tsx`.

**Deliverables:**

1. 3D focus stack with spring transitions.
2. Reduced-motion fallback.
3. Unsynced line-level highlight only.
4. a11y fix for word-progress duplication.
5. Motion acceptance tests (M-01–M-05).

**Merge order:** Second (may conflict in `index.css` — coordinate tokens by section comments).

---

### Track C — Plain Sync Engine

**Owner:** Implementer C  
**Duration:** ~2–3 days  
**Depends on:** Phase 0 only (fully independent)

| File | Exclusive ownership |
|------|---------------------|
| `src/lib/plain-sync.ts` | ✓ (new) |
| `src/lib/lrc-parser.ts` | ✓ (`parsePlainLyrics` delegate only) |
| `src/lib/sync-engine.ts` | ✓ (add `getSectionState` only) |
| `tests/lib/plain-sync.test.ts` | ✓ (new) |
| `tests/lib/sync-engine.test.ts` | ✓ (append section state tests) |

**Do not touch:** Any component files, `index.css`, `player-page.tsx`.

**Deliverables:**

1. Syllable-weighted plain sync v1.
2. Verse gap + chorus locking.
3. Section state helper for future intro/gap UI.
4. Sync acceptance tests (S-01–S-07).

**Merge order:** Anytime; preferred parallel with A/B.

---

### Phase 4 — Integration (1 day, any owner)

| Task | Files |
|------|-------|
| Wire `getSectionState` → intro/gap placeholder in stage | `lyrics-stage.tsx` (B owns — small PR) |
| Sticky unsynced banner (from reviews) | `lyrics-stage.tsx` + `transport-controls.tsx` (A+B) |
| Font scale preset (P1) | `player-store.ts`, `lyric-line.tsx`, transport |
| Full regression | `npm test`, manual player walkthrough |

---

### Conflict matrix

|  | A (layout) | B (motion) | C (sync) |
|--|------------|------------|----------|
| **A** | — | `index.css` tokens | None |
| **B** | `lyrics-stage` className | — | None |
| **C** | None | None | — |

**`index.css` resolution:** Partition by comment blocks: `/* layout */`, `/* motion */`, `/* tokens-shared */`.

---

## 5. Review Checklist

Use before marking epic complete.

### 5.1 Accessibility

- [ ] Play/pause, seek, offset controls have accessible names (existing + preserved).
- [ ] Active line: single accessible text node (no duplicate SR announcement).
- [ ] `aria-current="true"` on active line only.
- [ ] Sticky transport does not trap focus; tab order: stage lines → transport → PiP.
- [ ] `prefers-reduced-motion` disables blur, Z-lift, smooth scroll.
- [ ] Unsynced banner: `role="status"`, sufficient contrast (≥ 4.5:1), not `text-xs` only.
- [ ] Color contrast: light mode active line ≥ 3:1 against stage (fix per visual-polish audit).
- [ ] PiP iframe: `title` attribute on embed; keyboard-dismissable if draggable added later.
- [ ] Line buttons: consider `tabIndex={-1}` on non-active lines with roving `aria-activedescendant` (P1).

### 5.2 Performance

- [ ] No `layout` prop on every lyric line (only container if needed).
- [ ] rAF sync loop unchanged (`use-lyrics-sync.ts`); no extra store writes per frame.
- [ ] Plain sync runs once at parse time, not per frame.
- [ ] 80+ lines: consider windowing; profile with React DevTools + 6× CPU throttle.
- [ ] `filter: blur()` on ≤ 15 visible lines max (windowing helps).
- [ ] PiP video: `will-change: transform` on overlay only, not stage.
- [ ] No layout thrash: `getBoundingClientRect` only in scroll effect (existing).

### 5.3 Mobile

- [ ] Transport visible on 375px width without horizontal scroll (wrap OK).
- [ ] Touch targets ≥ 44px (play, seek thumb, offset buttons).
- [ ] `100dvh` shell; address bar show/hide doesn't hide transport.
- [ ] PiP doesn't cover active line (position top-right, max 40vw).
- [ ] Safe-area insets on bottom transport.
- [ ] Lyrics stage scrolls with momentum; transport doesn't move.
- [ ] Orientation change: layout recalculates, active line still visible.

### 5.4 Regression guards

```bash
npm test
npm run build
```

Manual smoke (from `karaoke-singer-ux.md`):

1. Synced LRC fast chorus — centering, no chase jank.
2. Plain lyrics — timing visibly improved vs equal slices; sticky unsynced banner.
3. Offset ±0.5s — highlight moves; resets on new song (separate backlog).
4. Hide video — PiP gone, audio continues.
5. `prefers-reduced-motion` — instant, no blur.

---

## Appendix A — Token additions (`index.css`)

```css
:root {
  --player-transport-h: 4.5rem;
  --lyric-focus-scale-active: 1;
  --lyric-focus-scale-near: 0.92;
  --lyric-focus-opacity-floor: 0.35; /* venue readability */
  --lyric-perspective: 1200px;
}
```

## Appendix B — Related backlog (out of scope)

| ID | Item | Notes |
|----|------|-------|
| FB-karaoke-002 | Fine-grained offset slider | Transport enhancement |
| FB-karaoke-003 | Instrumental placeholder UI | Uses `getSectionState` |
| Focus mode | Full chrome hide | Layout track stretch |
| Word-level LRC | Per-word timestamps | Requires provider support |

## Appendix C — File map (quick reference)

```
src/pages/player-page.tsx          ← Layout
src/components/video-overlay.tsx   ← Layout (new)
src/components/transport-controls.tsx ← Layout (sticky)
src/components/lyrics-stage.tsx    ← Motion
src/components/lyric-line.tsx      ← Motion
src/lib/lyric-motion.ts            ← Motion (new)
src/lib/lyric-scroll.ts            ← Motion
src/lib/plain-sync.ts              ← Sync (new)
src/lib/lrc-parser.ts              ← Sync
src/lib/sync-engine.ts             ← Sync (section state)
src/hooks/use-lyrics-sync.ts       ← Unchanged
src/index.css                      ← Shared tokens (partitioned)
tests/lib/plain-sync.test.ts       ← Sync (new)
tests/components/lyric-line.test.tsx ← Motion
```

---

*Plan authored 2026-06-15. No implementation in this PR — docs only.*
