# Approved Feature Backlog

## Approved for v1

### FB-ux-001: Keyboard shortcuts for transport
- **Effort:** S
- **Files:** `src/hooks/use-keyboard-shortcuts.ts`, `src/components/transport-controls.tsx`, `src/components/shortcuts-help.tsx`
- **Depends on:** Task 11 (transport controls)
- **Slot:** Wave 4.5 #1

### FB-karaoke-001: Tap line to seek
- **Effort:** S
- **Files:** `src/components/lyric-line.tsx`, `src/components/lyrics-stage.tsx`
- **Depends on:** Task 10 (lyrics stage)
- **Slot:** Wave 4.5 #2

### FB-power-001: Recent songs in localStorage
- **Effort:** S
- **Files:** `src/lib/recent-songs.ts`, `src/pages/home-page.tsx`
- **Depends on:** Task 13 (player page)
- **Slot:** Wave 4.5 #3

## Deferred (v2)

### FB-ux-002: Instant URL paste with auto-submit
- Good UX but overlaps with core URL input behavior

### FB-ux-003: Lyric line size presets
- Defer; font size slider (FB-a11y-001) covers similar need

### FB-karaoke-002: Fine-grained sync offset slider
- ±0.5s buttons sufficient for v1

### FB-karaoke-003: Instrumental gap indicator
- Effort M, nice-to-have

### FB-power-002: Shareable deep link copy button
- Partially covered by routing; defer copy UX

### FB-power-003: Fullscreen lyrics stage mode
- Effort M

### FB-a11y-001: Font size slider
- Defer to v2

### FB-a11y-002: Screen reader live region
- Defer to v2

### FB-a11y-003: High contrast mode
- Defer to v2

### FB-perf-001: Lyrics cache IndexedDB
- Effort M

### FB-perf-002: Skeleton lyrics stage
- Partially implemented in lyrics stage loading state

### FB-perf-003: Prefetch lyrics on paste
- Effort M, complexity
