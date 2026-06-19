# Visual & Micro-Interaction Polish Audit — umbra

**Date:** 2026-06-15  
**Scope:** `index.css`, theme tokens, `lyrics-stage`, `lyric-line`, `transport-controls`, `app-shell`, `animated-icon`, home + player (both themes)  
**Methods:** Source review, OKLCH contrast math, live browser screenshots, CDP bounding-box measurement  
**Related:** [accessibility-ux-audit.md](accessibility-ux-audit.md), [karaoke-singer-ux.md](karaoke-singer-ux.md)

---

## Screenshots captured (browser)

| View | Theme | State |
|------|-------|-------|
| `/` | Dark (default) | Hero + URL input |
| `/` | Light | Same, off-white bg, purple Start |
| `/play/dQw4w9WgXcQ` | Light | Split layout, video + skeleton lyrics |
| `/play/dQw4w9WgXcQ` | Light | Video hidden, lyrics loaded, unsynced banner |
| `/play/dQw4w9WgXcQ` | Dark | Full-width lyrics, active line visible |

**Live observations:** Light inactive lyrics are nearly invisible; active line reads gray not magenta; video hide expands lyrics full-width but leaves black void when shown; transport bar clusters many controls; seek thumb ~12–16px despite 44px track height.

---

## Anti-patterns verdict

**Borderline AI/product-slop, not a gallery.** Tells: lavender-tinted near-white light bg (`oklch(0.98 0.01 280)`), magenta accent on every primary surface, decorative `backdrop-blur-sm` on transport, spring-bouncy icon hover, `lucide-animated` name without path animations. **Not present:** gradient text, hero metrics, numbered sections, glass cards everywhere. Karaoke-specific tokens (`--karaoke-*`) show intent; execution gaps are contrast, motion discipline, and icon honesty.

---

## Typography & contrast (karaoke)

| Pair | Est. ratio | WCAG AA (large text) | Notes |
|------|------------|----------------------|-------|
| Light `--karaoke-active` on `--karaoke-stage-bg` | **~2.67:1** | Fail (needs ≥3:1) | Active line looks washed out in screenshots |
| Light inactive + `opacity: 0.55` | **~2.07:1** | Fail | Double-dimming in `lyric-line.tsx` |
| Light `--karaoke-muted` on stage | **~4.47:1** | Borderline normal / pass large | Still weak at distance |
| Dark `--karaoke-active` on stage | **~8.09:1** | Pass | Dark mode karaoke works |
| Dark inactive @0.55 opacity | **~2.47:1** eff. | Fail | Same opacity issue |
| `text-amber-500/90` warning on light stage | **~2.05:1** | Fail | Hardcoded, not tokenized |

**Active vs inactive scale:** `clamp(1.1–1.75rem)` → `clamp(1.5–3rem)` ≈ **1.59–2.0×** — good hierarchy, undermined by color/opacity.

**Product register conflict:** Fluid `clamp()` on lyric lines (`lyric-line.tsx` inline `fontSize`) vs impeccable product guidance (fixed rem scale for tools).

---

## Spacing, alignment, z-index

- **Lyrics rhythm:** `gap-1` (4px) between lines — too tight for TV/distance singing; stage `py-12` + `px-4` generous vertically, cramped inter-line.
- **Transport rhythm:** `gap-3` in bar vs `gap-1` in lyrics — inconsistent scale.
- **Player chrome:** Breadcrumb bar (`px-4 py-2`) + header + transport = three horizontal bands; hide-video does not reduce chrome (karaoke mode still feels like IDE split).
- **Z-index:** Only `z-50` on dropdown content; no semantic scale. Transport is not `sticky`/`z-*` — scrolls away with lyrics on long sets.
- **Alignment:** Lyrics center in `max-w-3xl`; video left column top-aligned with large black void below embed (aspect-video only on panel, column stretches).

---

## Motion audit

| Animation | Location | Reduced-motion? | Issue |
|-----------|----------|-----------------|-------|
| Opacity 0.55↔1 | `lyric-line.tsx` | Yes (`MotionConfig`) | OK |
| `layout` on lyric button | `lyric-line.tsx` | Partial | Layout reflow every line change — jank |
| `scale-[1.02]` CSS | `lyric-line.tsx` | **No** | Transform without `motion-reduce:` |
| `scrollIntoView smooth` | `lyrics-stage.tsx` | **No** | Always smooth scroll |
| `transition-all` height/opacity | `youtube-panel.tsx` | **No** | Animates layout (height 0 ↔ aspect-video) |
| `lg:w-0` width collapse | `player-page.tsx` | **No** | Sibling reflow, lyrics jump |
| Spring scale/rotate | `animated-icon.tsx` | **No** | Decorative bounce; `stiffness: 400` |
| `animate-pulse` skeletons | `lyrics-stage.tsx` | Yes (`motion-reduce:animate-none`) | OK |

---

## Theme consistency

**Tokenized:** All shadcn + karaoke colors in `index.css` OKLCH — good foundation.

**Hardcoded escapes:**

- `text-amber-500` / `text-amber-500/90` — `lyrics-stage.tsx`, `player-page.tsx`
- `bg-black` — `youtube-panel.tsx`
- `bg-card/80 backdrop-blur-sm` — `transport-controls.tsx` (decorative glass)

**Light/dark parity:** Dark karaoke readable; light theme fails the hero surface (stage + lyrics). Default theme is `dark` (`theme-provider.tsx`) — fine for dim-room karaoke, but light mode ships broken for its primary content.

---

## lucide-animated vs static

**Plan required** lucide-animated path JSON icons via shadcn CLI. **Shipped:** `AnimatedIcon` wraps static `lucide-react` with spring hover/tap — no path morphing. `icons/index.ts` re-exports aliases (`PlayIcon`, `MoonIcon`, etc.) that mislead.

**Static icons missed / inconsistent:**

- `HelpCircle` in `transport-controls.tsx` — no `AnimatedIcon` wrapper
- Theme Sun/Moon use `AnimatedIcon` but same static SVGs
- Play/Pause/EyeOff/Music get wrapper; behavior identical across all

---

## Transport affordances (measured)

| Control | Size | ≥44px? |
|---------|------|--------|
| Play/pause (`size="icon"`) | 44×44 | Yes |
| Seek track (`min-h-[44px]`) | 44×~499 | Track yes |
| Seek **thumb** | ~12–16px dia. | **No** — hard to grab |
| ±0.5s ghost buttons | 60×44 | Width OK; low visual affordance |
| Display `<select>` | 44h | Yes |
| Help `?` icon | 44×44 | Yes |

Seek uses native `accent-primary` only — no custom thumb styling in CSS.

---

## Video hide transition

```12:14:src/components/youtube-panel.tsx
        "relative w-full overflow-hidden rounded-lg bg-black transition-all",
        hidden ? "h-0 opacity-0" : "aspect-video opacity-100",
```

Combined with:

```143:148:src/pages/player-page.tsx
        <div
          className={`flex flex-col ${videoHidden ? "lg:w-0" : "lg:w-1/2"} w-full border-b ...`}
        >
```

**Result:** Simultaneous height collapse, opacity fade, and (desktop) width `50% → 0`. `transition-all` animates layout properties → visible reflow/jump; lyrics column snaps to full width without choreographed easing. On mobile, `w-full` stays while `h-0` — different behavior per breakpoint. **Jarring:** yes, especially toggling mid-song.

---

## 20 fine-grained polish items

### Typography & contrast

**1. Light active lyric contrast failure**

- **Where:** `index.css` (`--karaoke-active`), `lyric-line.tsx`
- **Fix:** Light theme: `--karaoke-active: oklch(0.42 0.22 320)` (target ≥4.5:1 on `--karaoke-stage-bg`). Or active line uses `text-foreground` with `font-bold` + magenta underline/progress fill only.

**2. Remove inactive opacity stacking**

- **Where:** `lyric-line.tsx` `animate={{ opacity: active ? 1 : 0.55 }}`
- **Fix:** Drop opacity animation; use `text-karaoke-muted` alone. Darken light `--karaoke-muted` to `oklch(0.42 0.04 280)` if still too faint.

**3. Word-fill ghost layer too faint**

- **Where:** `lyric-line.tsx` `text-muted-foreground/40`
- **Fix:** Use `text-karaoke-muted/70` or dedicated `--karaoke-unsung` token; keeps wipe readable in light mode.

**4. Replace fluid clamp lyric sizes with fixed scale**

- **Where:** `lyric-line.tsx` inline `fontSize: clamp(...)`
- **Fix:** `text-xl` inactive / `text-3xl` active (or `text-2xl`/`text-4xl`) + optional CSS variable `--karaoke-font-scale` for singer preference. Matches product register.

### Spacing & layout

**5. Tight inter-line gap**

- **Where:** `lyrics-stage.tsx` `gap-1`
- **Fix:** `gap-3` or `space-y-3`; add `scroll-padding-y-24` so active line isn't flush against edges when centered.

**6. Transport bar not pinned**

- **Where:** `transport-controls.tsx` root div
- **Fix:** Wrap in `sticky bottom-0 z-20 border-t bg-card` (solid, no blur). Lyrics stage gets `pb-[transport-height]`.

**7. Video column black void**

- **Where:** `player-page.tsx` flex split
- **Fix:** Grid `lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` with video `self-start sticky top-0`; panel `max-h-[50vh]` on desktop so lyrics aren't squeezed.

**8. Define z-index scale in tokens**

- **Where:** `index.css`
- **Fix:** `--z-sticky: 10; --z-dropdown: 50; --z-toast: 60` mapped in `@theme`. Apply to transport/header.

### Motion

**9. `scrollIntoView` ignores reduced motion**

- **Where:** `lyrics-stage.tsx`
- **Fix:** `behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'`.

**10. Remove `layout` from lyric buttons**

- **Where:** `lyric-line.tsx` `layout` prop
- **Fix:** Delete `layout`; size change handled by font-size transition only (`transition-[font-size,color] duration-200 ease-out`).

**11. `scale-[1.02]` without reduced-motion guard**

- **Where:** `lyric-line.tsx` active class
- **Fix:** `motion-safe:scale-[1.02]` or move scale into Motion with `reducedMotion="user"`.

**12. Replace icon spring with product timing**

- **Where:** `animated-icon.tsx`
- **Fix:** `transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}`; remove rotate. Wrap in `motion-reduce:transform-none`.

### Video hide

**13. Stop animating layout with `transition-all`**

- **Where:** `youtube-panel.tsx`, `player-page.tsx`
- **Fix:** Grid `grid-template-columns: 1fr` vs `1fr 1fr` with `transition-[grid-template-columns] duration-200 ease-out` **or** keep video in DOM with `translate-x-full opacity-0 pointer-events-none` (no height animation). Add `motion-reduce:transition-none`.

**14. Consistent mobile/desktop hide behavior**

- **Where:** `player-page.tsx` `lg:w-0` vs `h-0`
- **Fix:** Single strategy: always collapse column via grid, not `h-0` on mobile + `w-0` on desktop.

### Theming

**15. Tokenize warning amber**

- **Where:** `lyrics-stage.tsx`, `player-page.tsx`, `index.css`
- **Fix:** Add `--warning` / `--warning-foreground` per theme (OKLCH, ≥4.5:1 on stage). Replace `text-amber-500*`.

**16. Remove transport glassmorphism**

- **Where:** `transport-controls.tsx` `bg-card/80 backdrop-blur-sm`
- **Fix:** `bg-card` solid — impeccable ban on decorative glass; improves readability over scrolling lyrics.

**17. Video chrome token**

- **Where:** `youtube-panel.tsx` `bg-black`
- **Fix:** `bg-[var(--video-bg)]` with `--video-bg: oklch(0.05 0 0)` in both themes.

### Icons & affordances

**18. Honest icon strategy (lucide-animated)**

- **Where:** `animated-icon.tsx`, `icons/index.ts`
- **Fix:** Either install real lucide-animated path icons for play/pause/theme **or** rename to `IconMotion` and drop misleading exports. Add same treatment to `HelpCircle` for consistency **or** leave all static.

**19. Custom seek thumb for touch**

- **Where:** `index.css` + `transport-controls.tsx`
- **Fix:** Style `input[type=range]` — thumb `20×20px` circle, `box-shadow`, `cursor-grab`; track `h-1.5 rounded-full bg-muted`. Keep `min-h-[44px]` on input for hit area.

**20. Sync offset controls need visual affordance**

- **Where:** `transport-controls.tsx`
- **Fix:** Group in labeled `fieldset` or pill: `[ Lyrics sync ] −0.5s | 0.0s | +0.5s` with `border border-border rounded-md px-2`. Replace native `<select>` with shadcn `DropdownMenu` to match theme toggle vocabulary.

---

## Positive findings

- OKLCH token system with karaoke-specific roles (`--karaoke-active`, `--karaoke-stage-bg`)
- `min-h-[44px]` on buttons, inputs, seek track — intentional touch sizing
- `MotionConfig reducedMotion="user"` on lyric lines (partial compliance)
- `focus-visible:ring-2` on interactive elements
- Skeleton loading (not spinners) in lyrics stage
- DM Sans single-family stack — appropriate for product UI
- Dark theme karaoke contrast is strong

---

## Suggested command order (impeccable)

1. `$impeccable colorize` — light lyric + warning tokens
2. `$impeccable animate` — reduced-motion pass, video hide, icon timing
3. `$impeccable layout` — grid split, sticky transport, inter-line rhythm
4. `$impeccable polish` — seek thumb, sync control grouping, icon honesty

---

*Re-run after fixes with both themes at 375px, 1280px, and `prefers-reduced-motion: reduce`.*
