# Karaoke Singer UX Review

**Date:** 2026-06-15  
**Lens:** Singer at laptop, dim room, occasional party-TV distance  
**Scope:** `sync-engine`, `lyrics-stage`, `player-store`, `player-page` + live player route  
**Method:** Code audit + browser snapshot on preview build

---

## Executive summary

Core karaoke loop works: LRC sync, line highlight, tap-to-seek, offset nudge, bilingual modes, hide-video. Gaps that hurt **mid-song trust**:

1. Sync offset controls are cryptic (`−0.5s` / `0.0s` / `+0.5s`) — discoverable only via `?` shortcuts menu
2. Inter-line dead air → no active line (`activeIndex === -1`)
3. Hide-video ≠ karaoke mode — header, nav bar, transport chrome remain
4. Unsynced fallback banner is easy to miss
5. Bilingual "Both" stacks tiny English under large native — neck-crank at distance
6. Word highlight is line-duration wipe, not word-timed
7. No font-size control for aging eyes / TV

---

## 1. Lyrics sync feel

### Offset controls discoverability

```65:75:src/components/transport-controls.tsx
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => adjustOffset(-500)} aria-label="Earlier lyrics">
          −0.5s
        </Button>
        <span className="min-w-12 text-center text-xs tabular-nums">
          {(syncOffsetMs / 1000).toFixed(1)}s
        </span>
        <Button variant="ghost" size="sm" onClick={() => adjustOffset(500)} aria-label="Later lyrics">
          +0.5s
        </Button>
      </div>
```

- No label ("Lyrics timing", "Sync")
- `0.0s` reads like playback position, not offset
- Keyboard `+`/`−` only in shortcuts dropdown (`?` icon, last item in crowded transport bar)
- Offset **persists across songs** (`player-store` never resets `syncOffsetMs` on new load) — wrong song can inherit wrong offset

### Is ±0.5s enough?

- Fine for micro-nudges once singer knows controls exist
- Many LRC files off by 1–3s — need many taps or hold-to-repeat
- No ±0.1s, no slider (backlog [FB-karaoke-002](docs/superpowers/backlog/proposals/FB-karaoke-002.md))
- **Verdict:** ±0.5s OK as step size; need labeled control + coarse slider (−5s…+5s) + per-song reset

### Sync engine behavior

```20:24:src/lib/sync-engine.ts
  const idx = lo - 1
  if (idx < 0) return -1
  if (t >= lines[idx].startMs && t < lines[idx].endMs) return idx
  if (idx === lines.length - 1 && t >= lines[idx].startMs) return idx
  return -1
```

LRC parser sets `endMs = next.startMs`, so **gaps collapse into one long active line**:

```31:34:src/lib/lrc-parser.ts
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]
    lines[i].endMs = next ? next.startMs : durationMs > 0 ? durationMs : lines[i].startMs + 5000
```

20s instrumental after a verse → that verse stays "active" with slow left-to-right wipe. Singer thinks app froze.

Before first timestamp: `activeIndex === -1` — correct for intro, but no "♪ Intro ♪" cue.

---

## 2. Word-level highlight readability

```45:54:src/components/lyric-line.tsx
            {active ? (
              <span className="relative inline">
                <span
                  className="absolute inset-0 text-karaoke-active"
                  style={{ width: `${progress * 100}%`, overflow: "hidden" }}
                  aria-hidden
                >
                  {text}
                </span>
                <span className="text-muted-foreground/40">{text}</span>
```

- **Line-level** wipe via `getWordProgress` — not per-word LRC
- Ghost text at 40% opacity — readable in dark mode; light mode contrast weaker
- English subtitle: **no wipe**, always `text-sm text-muted-foreground`
- `motion.button` + `layout` + `scale-[1.02]` on active line — can fight scroll

**Singer read:** Works for short lines at arm's length. Long lines + instrumental = misleading slow crawl. English-only singers get no highlight at all.

---

## 3. Auto-scroll

```32:34:src/components/lyrics-stage.tsx
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeIndex])
```

- **Centers** active line — good intent
- `behavior: "smooth"` every line change → lag on fast choruses; feels "chasing"
- Framer `layout` on each line amplifies jumpiness
- No `prefers-reduced-motion` branch for scroll (only MotionConfig on lines)
- **Verdict:** Centering OK; switch to `behavior: "instant"` when reduced-motion, or `'auto'` after first scroll

---

## 4. Bilingual modes

```61:63:src/components/lyric-line.tsx
        {showEnglish && (
          <span className="mt-1 block text-sm text-muted-foreground">{englishText}</span>
        )}
```

- Native active: `clamp(1.5rem, 4vw, 3rem)` (~24–48px)
- English: ~14px fixed — **~3× smaller**
- "Both" = read up (bright, large) + down (dim, small) — neck craning
- Line mismatch: tiny amber in top bar (`Line count mismatch`) — easy to miss mid-song
- Display mode: plain `<select>` in transport — fine on desktop, fiddly one-handed

---

## 5. Hide-video mode

```10:18:src/components/youtube-panel.tsx
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg bg-black transition-all",
        hidden ? "h-0 opacity-0" : "aspect-video opacity-100",
      )}
```

```141:148:src/pages/player-page.tsx
      <div className="flex flex-1 flex-col lg:flex-row">
        <div
          className={`flex flex-col ${videoHidden ? "lg:w-0" : "lg:w-1/2"} w-full border-b border-border lg:border-b-0 lg:border-r`}
        >
          <YouTubePanel containerRef={containerRef} hidden={videoHidden} />
        </div>
        <div className={`flex flex-1 flex-col ${videoHidden ? "w-full" : "lg:w-1/2"}`}>
```

**Still visible when video hidden:**
- App header (`song-kara` + theme toggle)
- `← Home` sub-nav
- Full transport bar (seek, offset, help)
- Mobile: video column still `w-full` with `border-b` — wasted vertical slice

**Not fullscreen-worthy** for party TV. Needs **Focus mode**: hide header + sub-nav, enlarge lyrics, minimal floating transport.

Audio continues (YouTube iframe hidden, not destroyed) — good.

---

## 6. Audio-only playback state

When video hidden, only cues:
- Play/Pause icon in transport
- Seek slider position
- No track title on stage, no pulsing "now playing", no waveform/bar

In dim room, easy to forget if paused vs buffering. **Need persistent now-playing strip** when video hidden.

---

## 7. Instrumental sections / LRC gaps

No instrumental placeholder (backlog [FB-karaoke-003](docs/superpowers/backlog/proposals/FB-karaoke-003.md)).

Current behavior:
| Scenario | What singer sees |
|----------|------------------|
| Gap before first line | All lines dim, nothing active |
| Long gap between timestamps | Previous line active, slow wipe |
| True instrumental track | May get "No lyrics found" or sparse LRC |

---

## 8. Unsynced fallback honesty

```69:72:src/components/lyrics-stage.tsx
      {!lyricsSynced && (
        <p className="mb-4 text-center text-xs text-amber-500/90" role="status">
          No synced lyrics — approximate timing
        </p>
      )}
```

- One-time `text-xs` banner — scrolls away
- `parsePlainLyrics` evenly distributes lines — chorus won't land on beat
- No explanation of **what to do** (tap lines, use offset, find better source)
- Singer blames self when timing drifts

---

## 9. Font size / party TV

| Element | Size | TV at 2–3m |
|---------|------|------------|
| Active line | `clamp(1.5rem, 4vw, 3rem)` | Marginal on laptop; small on TV |
| Inactive | `clamp(1.1rem, 3vw, 1.75rem)` | Hard to preview ahead |
| English | `text-sm` | Unreadable |
| Unsynced banner | `text-xs` | Invisible |

No user preference for font scale. Design spec targets laptop, not HDMI.

---

## Browser test notes

| Check | Result |
|-------|--------|
| Route `/play/:videoId` | Loads |
| Hide video toggle | Works; aria `Show video` / `Hide video` |
| Offset controls | Visible, unlabeled |
| Shortcuts `?` | Lists `+ / − Sync offset ±0.5s` |
| Live lyrics sync | **Not tested** — YouTube embed unavailable in preview |
| Dark mode default | Confirmed — good for dim room |

---

## Recommendations

### P0 — Fix before calling it "karaoke-ready"

#### P0-1: Label sync controls + reset per song
**Problem:** Singer can't find timing fix when lyrics drift.  
**UI mockup (transport bar):**
```
[ ▶ ] ———●———— 1:24 / 3:45

Lyrics timing:  [ ◀ Earlier ]  +0.0s  [ Later ▶ ]
                └ tap or press + / − keys
```
On new song load: reset offset to `0.0s`. Toast if inherited offset was non-zero:
> **New song — timing reset to 0s.** Press **Later** if lyrics still feel early.

---

#### P0-2: Inter-line dead air + long holds
**Problem:** 20s instrumental shows stale line with creeping wipe.  
**UI mockup (stage, during gap):**
```
        ♪  Instrumental  ♪
   (next line previews dim below)
```
Detect `gapMs = next.startMs - prev.startMs > 8000` OR active line duration > 1.5× median. Clear wipe; show placeholder. Respect `prefers-reduced-motion`.

---

#### P0-3: Focus mode (not just hide video)
**Problem:** Hide video still shows chrome; not TV-worthy.  
**UI mockup:**
```
┌─────────────────────────────────────────┐
│  Bohemian Rhapsody          [⊡] [Aa]   │  ← slim strip, auto-hide
│                                         │
│         Is this the real life?          │  ← 2× font
│         Is this just fantasy?           │
│                                         │
│              [  ▶  ]  1:24              │  ← minimal floater
└─────────────────────────────────────────┘
```
`⊡` = exit focus. `[Aa]` = font size. Hide: header, Home link, seek slider (optional expand).

---

#### P0-4: Unsynced honesty banner (sticky)
**Problem:** Singer trusts bad timing.  
**UI mockup:**
```
┌──────────────────────────────────────────────────┐
│ ⓘ Timing is approximate — lines won't match the │
│   beat. Tap a line to jump, or adjust timing     │
│   below.                              [ Got it ] │
└──────────────────────────────────────────────────┘
```
Sticky until dismissed or synced LRC found. `role="status"` + `aria-live="polite"`.

---

#### P0-5: Bilingual "Both" readability
**Problem:** English unreadable at singing distance.  
**UI mockup:**
```
    今夜はビューティフルな夜さ          ← native, 1.4× when active
    Tonight is a beautiful night        ← english, clamp(1rem, 2.5vw, 1.25rem)
```
Scale English with native; optional `[ Native | Both | English ]` segmented control.

---

#### P0-6: Playback state when video hidden
**Problem:** Can't tell if paused.  
**UI mockup (floating chip above transport):**
```
  ● Playing · Queen — Bohemian Rhapsody     (or)
  ❚❚ Paused · tap space to continue
```
Pulsing dot when playing; static when paused.

---

### P1 — High value polish

#### P1-1: Fine-grained offset slider (FB-karaoke-002)
```
Lyrics timing:  ◀ −0.5s  [———●————]  +0.5s ▶   +1.5s
                         −5s    0    +5s
```

#### P1-2: Font size control
```
Text size:  [ S ]  [ M ]  [ L ]  [ XL ]
```
Persist in `localStorage`. XL: active `clamp(2rem, 6vw, 4.5rem)`.

#### P1-3: Scroll smoothness
- `scrollIntoView({ block: 'center', behavior: 'auto' })` by default
- `smooth` only if user prefers motion
- Remove `layout` from inactive lines

#### P1-4: Intro / pre-lyrics state
Before first line:
> **♪ Intro — lyrics start at 0:42**

#### P1-5: Line-count mismatch (bilingual)
Move to stage when `displayMode === 'both'`:
> **ⓘ English lines don't line up with original — showing best match.**

#### P1-6: Keyboard shortcut discoverability
First visit tooltip on offset cluster:
> **Lyrics off beat? Press + or − to nudge timing.**

#### P1-7: English-only karaoke wipe
Apply same wipe to `englishText` when `displayMode === 'english'`.

---

## Priority matrix

| ID | Issue | Singer impact | Effort |
|----|-------|---------------|--------|
| P0-1 | Label + reset sync offset | High — first fix when drift | S |
| P0-2 | Instrumental / gap handling | High — trust during breaks | M |
| P0-3 | Focus mode | High — laptop + TV | M |
| P0-4 | Sticky unsynced banner | High — sets expectations | S |
| P0-5 | Bilingual scale | High — non-English singers | S |
| P0-6 | Audio-only playback chip | Medium — dim-room clarity | S |
| P1-1 | Offset slider | Medium — coarse drift | S |
| P1-2 | Font size presets | Medium — TV / aging eyes | S |
| P1-3 | Scroll / motion tuning | Medium — fast songs | S |
| P1-4 | Intro placeholder | Low–Medium | S |
| P1-5 | Mismatch warning on stage | Low–Medium | S |
| P1-6 | Offset onboarding tooltip | Medium — discoverability | S |
| P1-7 | English wipe | Low–Medium | S |

---

## What's already good

- Tap line to seek (FB-karaoke-001 shipped)
- Dark-first stage tokens — right for dim room
- `requestAnimationFrame` time sync — smooth enough
- Keyboard: space, arrows, +/− — solid once discovered
- `videoHidden` persisted — remembers preference
- `aria-current` on active line — a11y baseline
- Loading skeleton + retry on lyrics miss

---

## Suggested test plan (post-fix)

1. Synced LRC — fast chorus: active line stays centered, no scroll chase
2. Offset +3s via slider — highlight moves immediately, resets on new song
3. Unsynced plain lyrics — sticky banner, tap line jumps
4. 15s instrumental gap — placeholder, no stale wipe
5. Hide video → Focus — lyrics fill viewport, playback chip visible
6. Bilingual Both at 2m — both lines readable without head tilt
7. Font XL on 1080p TV — active line legible from couch

---

*Reviewed against commit state 2026-06-15. Re-test with working YouTube embed for live sync validation.*
