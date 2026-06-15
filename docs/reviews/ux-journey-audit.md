# UX Journey Audit — song-kara

**Date:** 2026-06-15  
**Method:** Code review (all pages, components, stores) + live browser walkthrough on `http://127.0.0.1:5175`  
**Test URL:** `https://www.youtube.com/watch?v=Ktk_EDLDPeY` (天音かなた — 別世界)  
**Register:** Product UI (karaoke tool, dark-first venue use)

---

## Executive summary

song-kara delivers a focused, low-clutter karaoke flow: paste → player → lyrics stage. Core mechanics work. Skeleton loading, keyboard shortcuts, video hide persistence, and bilingual controls show thoughtful craft.

The largest gaps are **distance readability** (active line too small/dim for a 2 m TV), **context on the player** (no visible title/artist to verify LRCLIB match), and **state continuity** (re-visits re-fetch lyrics; idle copy wrong on player route). Several fine details (icon state, scroll behavior, validation layering) erode trust in a category where timing and correctness are everything.

**Journey health:** Good foundation, not yet venue-ready.

| Dimension | Score (0–4) | Note |
|-----------|-------------|------|
| Task completion | 3 | Happy path works; edge cases under-explained |
| Feedback & loading | 2 | Lyrics skeleton good; video/route transitions silent |
| Copy & empty states | 2 | Functional but wrong-state messages exist |
| Accessibility | 2 | Keyboard shortcuts present; lyric buttons heavy for SR |
| Venue / 2 m readability | 1 | Active line max ~48 px, inactive at 55% opacity |
| Edge-case resilience | 2 | Retry form good; unsynced/plain mismatch weak |

---

## Journey map

```mermaid
flowchart LR
  A[First visit /] --> B[Paste URL]
  B --> C[/play/:videoId]
  C --> D[YouTube embed ready]
  D --> E[LRCLIB fetch]
  E --> F{Lyrics?}
  F -->|Yes| G[Lyrics stage]
  F -->|No| H[Retry form]
  G --> I[Play / sync / hide video]
  I --> J[Theme / bilingual / shortcuts]
  G --> K[Recent on Home]
  H --> E
```

---

## Step-by-step audit

### 1. First visit (Home `/`)

**What user sees/feels**
- Dark-first shell: header `song-kara` + theme toggle, centered hero "Sing along", single URL field + pink **Start** button.
- Cognitive load is **very low**. One obvious action. Feels like a tool, not marketing fluff.
- No sample link, no "how it works", no indication that paste auto-starts.

**Missing feedback**
- No subtle affordance that **paste alone** navigates (Start button becomes redundant after first use).
- Theme toggle is icon-only; first-time users may not discover light mode.

**Copy quality**
- "Sing along" + subline are clear and honest.
- "Start" is acceptable but generic; "Play video" or "Load song" would signal outcome better.
- Brand link uses `<a href="/">` (full document reload) instead of React Router `Link`.

**Edge cases**
- Empty recent list: section hidden entirely (good). No "nothing here yet" teaching moment when list is empty.
- Direct `/play/:id` deep links skip home onboarding entirely.

**Fine details**
- Focus order: logo → theme → URL → Start. Logical.
- URL field `type="url"` triggers **browser-native** validation before app logic (see Errors step).
- Hero is vertically centered with generous whitespace; works on desktop, may feel sparse on mobile.

**Browser evidence:** Home renders clean dark hero; recent section appeared after first successful play with full YouTube title string.

---

### 2. Paste URL (`UrlInput`)

**What user sees/feels**
- Placeholder "Paste YouTube URL…" sets expectation.
- **Auto-navigate on paste** when ID extractable — fast, delightful, zero extra click.
- Manual type + Start also works.

**Missing feedback**
- No inline "Loading…" or route-transition indicator between paste and player mount.
- Pasted text stays in home input if user navigates back (minor).

**Copy quality**
- Error (when shown): "Enter a valid YouTube URL or video ID" — clear, actionable.
- Supports bare 11-char IDs in code but `type="url"` prevents reaching that error for non-URL strings.

**Edge cases**
- `youtu.be`, `shorts`, `embed` patterns supported in code.
- Playlist URLs, mix URLs, timestamp params: only `v=` captured; no user message if wrong param.
- Paste with trailing whitespace: handled by trim.

**Fine details**
- `aria-invalid` + `role="alert"` on error — good.
- Music icon on Start adds charm; icon-only would fail label test (button has text — OK).
- `onPaste` + `setTimeout(0)` pattern works but is fragile if paste handlers change.

**Browser evidence:** Pasting full YouTube URL navigated immediately to `/play/Ktk_EDLDPeY`.

---

### 3. Route transition → Player mount

**What user sees/feels**
- Instant route change. Layout splits: video left (desktop) / lyrics right.
- **Confusing idle copy:** Lyrics stage shows **"Paste a link to start"** while already on `/play/:videoId` and YouTube is initializing (`status === "idle"`, empty lyrics).
- User may think paste failed or they're on the wrong page.

**Missing feedback**
- No page-level loading shell for "Preparing video…".
- YouTube embed error from `useYouTubePlayer` is **never surfaced** in UI.

**Copy quality**
- "← Home" is minimal; works for wayfinding.
- Idle message is **wrong context** on player route.

**Edge cases**
- Invalid `videoId` format in URL still mounts player; YouTube may fail silently.
- Zustand store is global: returning to a previous song may briefly show stale lyrics until new fetch sets `loading`.

**Fine details**
- `loadedRef` prevents double-fetch per mount but **resets on remount** → recent-link revisits always re-search LRCLIB.
- No `videoId` change handler to reset store when switching songs without unmount.

---

### 4. YouTube embed loading

**What user sees/feels**
- Black `aspect-video` panel; YouTube chrome appears when ready.
- On desktop split layout, video occupies **top of left column only**; large black void below video on tall viewports.
- When `videoHidden` (persisted in `localStorage`): left column collapses (`h-0`, `lg:w-0`); lyrics go full width — **excellent for karaoke mode**.

**Missing feedback**
- No spinner/skeleton on video panel during embed init.
- No "Video blocked" / embed error state.

**Copy quality**
- N/A at this stage.

**Edge cases**
- Age-restricted / region-blocked videos: no app-level message.
- Autoplay policies: user must click play (expected); no hint.

**Fine details**
- Hide button always shows `EyeOff` icon even when video is hidden (`aria-label` toggles correctly — icon does not).
- `aria-hidden={hidden}` on panel — good when collapsed.

**Browser evidence:** Video loaded with correct title/channel. Hide video expanded lyrics to full width; preference persisted across navigation.

---

### 5. Lyrics loading (LRCLIB)

**What user sees/feels**
- **Strong feedback:** 6 pulse skeleton bars + centered "Searching lyrics…" (`aria-busy`, `aria-label`).
- For test URL, fetch took ~5–10 s — skeleton held attention adequately.
- No percentage, no "still working" pulse after 15 s+.

**Missing feedback**
- No staged copy ("Fetching title…" → "Searching lyrics…").
- No cancel/retry during slow fetch.
- No indication of which artist/track is being searched (parsed title not shown yet).

**Copy quality**
- "Searching lyrics…" is clear and calm.

**Edge cases**
- Slow LRCLIB / network timeout: indefinite skeleton (catch sets error but no timeout).
- Multiple search strategies in `lyrics-service.ts` mean variable latency with no user-visible progress.

**Fine details**
- Skeleton respects `motion-reduce:animate-none` — good.
- Revisit via Recent triggers full re-fetch + skeleton again even for same `videoId`.

**Browser evidence:** Skeleton visible during fetch; transitioned to lyrics list on completion.

---

### 6. Lyrics found (success)

**What user sees/feels**
- Lyrics list on `--karaoke-stage-bg` surface; active line scales to `clamp(1.5rem, 4vw, 3rem)` with magenta `--karaoke-active`.
- Inactive lines at **55% opacity** — readable up close, **too dim at 2 m**.
- Click line → seeks (good power-user affordance).
- Active line auto-scrolls to center (`scrollIntoView({ block: "center", behavior: "smooth" })`).

**Missing feedback**
- **No success cue** ("Lyrics found" / checkmark / track name confirmation).
- No visible **song title or artist** in player chrome — user cannot verify LRCLIB match without reading lyrics content.
- Word-by-word highlight runs on active line but is subtle (overlay width on duplicate text span).

**Copy quality**
- N/A on success state.

**Edge cases**
- Wrong LRCLIB match (duration tolerance ±8 s, plain lyrics fallback): user has no way to know until lyrics feel wrong mid-song.
- For test URL: **plain lyrics only** → approximate timing banner shown.

**Fine details**
- Every line is a `<button>` with full lyric as accessible name — 40+ tab stops; screen reader traversal is exhausting.
- Active line accessible name **duplicates text** (word-progress overlay renders two copies) — confirmed in a11y tree.
- `layout` animation on every line via Framer Motion may cause jank on long songs.

**Browser evidence:** ~40 Japanese lines loaded; active line highlighted; includes expected lyric "遠い遠い別世界まで".

---

### 7. Lyrics not found (error)

**What user sees/feels**
- `LyricsRetry` form: artist + track inputs pre-filled from `parseTrackTitle`, **Search again** button.
- Copy: "No lyrics found — edit artist/title and retry".
- Track required (`disabled={!trackInput.trim()}`); artist optional.

**Missing feedback**
- No explanation of *why* search failed (no results vs network vs duration mismatch).
- No link to LRCLIB or manual LRC upload (out of scope but user dead-ends).

**Copy quality**
- Instructional and actionable. "Search again" is verb + object — good.
- Could name the source: "No lyrics on LRCLIB for …".

**Edge cases**
- Empty YouTube title → parse returns `{ artist: "", track: cleaned }` — retry still possible.
- Japanese title parsing swaps artist/track for CJK — generally correct for test URL.

**Fine details**
- Retry does not disable button during second fetch (no loading on retry).
- `setStatus("loading")` on retry — skeleton returns (good).

---

### 8. No synced lyrics (plain / approximate)

**What user sees/feels**
- Amber banner: **"No synced lyrics — approximate timing"** (`role="status"`).
- Lines evenly distributed across song duration — active line jumps on interval, not on musical phrasing.
- Word progress highlight is **misleading** without LRC timestamps (progress derived from character count heuristic).

**Missing feedback**
- Banner is `text-xs` — easy to miss from couch distance.
- No suggestion to adjust sync offset proactively.

**Copy quality**
- Honest and accurate. Could add: "Use ±0.5s below to adjust."

**Edge cases**
- User may not understand difference between synced and plain.
- English line search runs separately; may also be plain.

**Fine details**
- For venue use, unsynced mode should probably **disable word karaoke effect** and use line-level highlight only.

**Browser evidence:** Test URL showed approximate timing banner for entire session.

---

### 9. Playback & transport controls

**What user sees/feels**
- Bottom bar: play/pause, seek slider, time, sync offset (−0.5s / value / +0.5s), display mode (if non-English), hide video, shortcuts help.
- Bar uses `backdrop-blur-sm` + `bg-card/80` — readable over lyrics.
- Controls wrap on narrow widths.

**Missing feedback**
- Play/pause does not reflect YouTube buffering state.
- Sync offset value (`0.0s`) has no label — meaning opaque to first-time users.
- Seek slider marked `readonly` in a11y snapshot (implementation uses controlled `value` + `onChange` — may affect SR).

**Copy quality**
- `aria-label`s on icon buttons are good (Pause/Play, Earlier/Later lyrics, Hide/Show video).
- Offset buttons say "Earlier lyrics" / "Later lyrics" — better than bare −/+ but still jargon-adjacent.

**Edge cases**
- Space toggles play even when focus on seek slider? (keydown on window — yes, unless input focused).
- Seek while lyrics loading: works on video timeline; active index may be wrong.

**Fine details**
- `min-h-[44px]` on seek + select — touch target compliant.
- Time format `m:ss` — no hours for long videos.
- Transport bar competes visually with lyrics; no "now playing" header above stage.

---

### 10. Hide video

**What user sees/feels**
- Toggle collapses video panel; lyrics expand to full width.
- Preference **persists** via `localStorage` (`song-kara-video-hidden`) — excellent for repeat karaoke use.
- `aria-pressed` state updates correctly.

**Missing feedback**
- Icon always `EyeOff` — visual state does not match (should swap to `Eye` when hidden).
- No toast/confirmation ("Video hidden — lyrics expanded").

**Copy quality**
- `aria-label` toggles Hide/Show — good.

**Edge cases**
- First visit with persisted hidden: user may not know video exists or how to restore it (icon helps if recognizable).

**Fine details**
- Left column still renders DOM with `h-0 opacity-0` — fine for a11y (`aria-hidden`).

**Browser evidence:** Hide video worked; full-width lyrics; Show video label on second click.

---

### 11. Theme switch

**What user sees/feels**
- Header dropdown: Light / Dark / System.
- Persists to `localStorage` (`song-kara-theme`).
- Dark default matches design spec ("dim venue, screen glow").
- Light mode: higher contrast stage bg; karaoke tokens adjust.

**Missing feedback**
- No indication of current theme in menu (no checkmark on active item).
- Toggle button shows Sun/Moon by CSS class, not by resolved system theme.

**Copy quality**
- Standard labels — familiar.

**Edge cases**
- Theme change does not remount app in production; dev HMR may have caused transient re-fetch during audit (not a prod bug).

**Fine details**
- OKLCH tokens in `index.css` — consistent system.
- Light mode inactive lyric contrast still marginal at distance.

---

### 12. Bilingual / translation

**What user sees/feels**
- Non-English detected (`franc-min`): display mode `<select>` — Native / English / Both.
- Header **Translate to English** button when Chrome `Translator` API available.
- English lines from LRCLIB `searchEnglishLyrics` fetched automatically in background.

**Missing feedback**
- Selecting **English** or **Both** with no `englishLines` shows **blank** secondary content — no "Translation unavailable".
- "Line count mismatch" warning (`text-xs text-amber-500`) in header — easy to miss; no explanation of impact.
- Translate button shows "Translating…" — good.

**Copy quality**
- "Native" may confuse (means original language, not "native speaker").
- "Translate to English" is clear.

**Edge cases**
- Chrome Translator unavailable (Firefox, Safari): no translate button; English mode useless without LRCLIB English plain lyrics.
- `searchEnglishLyrics` appends " english" to track name — heuristic may miss.

**Fine details**
- English subtitle at `text-sm text-muted-foreground` — too small for 2 m even in Both mode.
- Display mode select hidden for English songs — correct.

---

### 13. Keyboard shortcuts

**What user sees/feels**
- `?` dropdown lists: Space (play/pause), ←/→ (±5s), +/− (sync offset).
- Shortcuts work when focus not in input/textarea.

**Missing feedback**
- No shortcut for hide video, display mode, or home.
- `+`/`−` sync offset does not call `preventDefault` — may zoom browser on some layouts.
- No `?` key to open help (must click).

**Copy quality**
- Help popover is concise; `<kbd>` styling is familiar.

**Edge cases**
- Space on player page scrolls page if handler misses — handler uses `preventDefault` — OK.
- YouTube iframe may capture focus and steal keyboard events.

**Fine details**
- Shortcuts not listed: click lyric to seek, Enter on retry form.
- Help is a dropdown not a dialog — no focus trap (acceptable for small menu).

**Browser evidence:** Shortcuts popover opened from footer `?` button; three bindings listed.

---

### 14. Recent songs (Home)

**What user sees/feels**
- After successful load, song added to Recent (max 10, deduped by `videoId`).
- List shows **full YouTube title** — long strings for JP MV titles.
- **Clear** button removes all with no confirmation.

**Missing feedback**
- No relative time ("2 hours ago") or play count.
- No thumbnail.

**Copy quality**
- "Recent" + "Clear" — minimal, clear.
- List items are links — good affordance.

**Edge cases**
- Title stored at fetch time; if empty, falls back to `videoId`.
- Clear is one-click irreversible.

**Fine details**
- Link focus ring visible — good.
- No truncation/ellipsis CSS — long titles wrap awkwardly in narrow viewports.
- Clicking recent re-navigates → full lyrics re-fetch (see step 3).

**Browser evidence:** Recent showed `【Original Anime MV】別世界 - 天音かなた【ホロライブ】` after first play.

---

### 15. Errors (URL validation & network)

**What user sees/feels**

| Input | Result |
|-------|--------|
| `not-a-valid-url` | Browser native tooltip ("Enter a web address" — **locale-dependent**); app error **not shown** |
| `https://example.com` | App error: "Enter a valid YouTube URL or video ID" (red, `role="alert"`) |
| LRCLIB failure | Retry form or generic error state |

**Missing feedback**
- Layered validation conflict between HTML5 `type="url"` and custom YouTube ID extraction.
- Network errors indistinguishable from "not found".
- YouTube embed errors invisible.

**Copy quality**
- Custom error message is good when it appears.
- Native browser tooltips break visual consistency.

**Edge cases**
- Bare video ID `Ktk_EDLDPeY` fails HTML5 URL validation on submit.
- Paste of valid URL bypasses submit validation via programmatic navigate — OK.

**Fine details**
- `aria-invalid` set on error — good.
- Error persists when navigating away and back (home state not cleared).

**Browser evidence:** Confirmed native tooltip for non-URL string; custom alert for example.com.

---

## Venue readability assessment (2 m distance)

Design spec targets `clamp(1.5rem, 4vw, 3rem)` active line (~48 px max). For a TV or projector at 2 m:

| Element | Current | Venue need | Gap |
|---------|---------|------------|-----|
| Active line size | max 3rem (~48 px) | 5–7rem (80–112 px) | Too small |
| Inactive line opacity | 0.55 | ≥ 0.35 with larger base size | Too faint |
| English subtitle | text-sm (~14 px) | text-lg minimum | Too small |
| Sync warning | text-xs amber | text-sm+ with icon | Too subtle |
| Transport time | text-xs | text-sm tabular | Borderline |

Active magenta on dark stage has good hue contrast; **size and inactive contrast** are the blockers.

---

## Positive findings

- **Paste-to-play** flow is fast and matches user mental model.
- **Lyrics loading skeleton** with status copy — product-grade pattern.
- **LyricsRetry** with pre-filled parse — strong error recovery.
- **Keyboard shortcuts + help popover** — shipped (FB-ux-001 done).
- **Video hide persistence** — respects repeat session behavior.
- **Japanese title parsing** with artist/track swap — domain-aware.
- **OKLCH token theming** with karaoke-specific colors — coherent dark-first identity.
- **Reduced motion** honored in CSS and MotionConfig.
- **Multi-strategy LRCLIB search** — robust backend logic (UX should surface confidence).

---

## Top 15 fine-detail improvements (ranked by impact)

| Rank | Improvement | Why it matters | Where |
|------|-------------|----------------|-------|
| 1 | **Venue typography pass** — active line min 5rem on large screens; inactive opacity floor 0.4; optional "TV mode" toggle | Core job is readable singing at distance; current max 48 px fails the venue scene in the design spec | `lyric-line.tsx`, `index.css` |
| 2 | **Now-playing header** — show parsed track, artist, and sync status above lyrics stage | Users cannot verify LRCLIB match; wrong lyrics destroy trust | `player-page.tsx`, `app-shell` or stage header |
| 3 | **Fix player idle copy** — replace "Paste a link to start" with "Loading video…" / "Preparing player…" when `videoId` present | Active confusion on every cold player load | `lyrics-stage.tsx` |
| 4 | **Cache lyrics per `videoId`** in session/localStorage; skip re-fetch on Recent revisit | Eliminates 5–10 s skeleton flash and LRCLIB result variance | `player-store.ts`, `player-page.tsx` |
| 5 | **Unsynced lyrics mode** — disable word-progress karaoke; use line-level highlight only; strengthen banner (icon + text-sm + offset hint) | Word highlight implies precision that plain lyrics don't have | `lyric-line.tsx`, `lyrics-stage.tsx` |
| 6 | **Hide/show video icon swap** (`Eye` when hidden, `EyeOff` when visible) | Icon contradicts action; erodes polish trust | `transport-controls.tsx` |
| 7 | **Replace `<a href="/">` with React Router `Link`** in header | Full page reload drops in-memory state, slower navigation | `app-shell.tsx` |
| 8 | **Fix URL input validation** — use `type="text"` + `inputMode="url"` or `noValidate` on form so bare video IDs and custom errors work | Blocks valid 11-char IDs; shows locale-native browser tooltips | `url-input.tsx` |
| 9 | **Smarter lyric scroll** — scroll only when active line outside center third; use `instant` or reduced-motion instant | Smooth scroll every line change causes jank and motion sickness on long tracks | `lyrics-stage.tsx` |
| 10 | **Label sync offset controls** — e.g. "Lyrics timing" group label + tooltip on ±0.5s | Offset UI is cryptic; singers need this mid-song under pressure | `transport-controls.tsx` |
| 11 | **Guard bilingual modes** — disable English/Both when `englishLines` empty; show "No English lyrics found" | Prevents blank stage when user selects English | `transport-controls.tsx`, `lyric-line.tsx` |
| 12 | **Recent songs polish** — truncate title with tooltip; show `artist · track` parse; optional relative time | Long JP MV titles overflow; hard to scan quickly | `home-page.tsx`, `recent-songs.ts` |
| 13 | **Fix active line SR duplication** — single text node for AT; visually hidden progress indicator | Screen readers announce every line twice when active | `lyric-line.tsx` |
| 14 | **Route transition feedback** — brief overlay "Opening player…" on navigate from home | Paste feels like nothing happened for 1–2 s on slow devices | `url-input.tsx` or route loader |
| 15 | **Surface YouTube + LRCLIB errors** — use `error` from `useYouTubePlayer`; distinguish network vs not-found in retry UI | Silent failures feel broken; users blame the app | `player-page.tsx`, `lyrics-retry.tsx` |

---

## Recommended next commands

1. **`$impeccable layout`** — player chrome (title bar, stage vs transport hierarchy, video column dead space)
2. **`$impeccable clarify`** — copy pass on idle states, unsynced banner, bilingual empty states
3. **`$impeccable harden`** — validation layering, error surfaces, lyrics cache
4. **`$impeccable polish`** — icon states, scroll behavior, recent list truncation

---

## Test artifacts

- Dev server: `npm run dev` → `http://127.0.0.1:5175`
- Browser walkthrough: home → paste/load test URL → loading skeleton → lyrics (plain/approximate) → hide video → theme menu → shortcuts popover → invalid URL errors → recent songs
- Screenshots captured in browser MCP session (2026-06-15)

---

## Files reviewed

| Area | Files |
|------|-------|
| Routes | `App.tsx`, `home-page.tsx`, `player-page.tsx` |
| Shell & input | `app-shell.tsx`, `url-input.tsx`, `mode-toggle.tsx`, `theme-provider.tsx` |
| Player UI | `lyrics-stage.tsx`, `lyric-line.tsx`, `lyrics-retry.tsx`, `transport-controls.tsx`, `youtube-panel.tsx`, `shortcuts-help.tsx` |
| State & hooks | `player-store.ts`, `use-youtube-player.ts`, `use-lyrics-sync.ts`, `use-keyboard-shortcuts.ts`, `use-translation.ts` |
| Services | `lyrics-service.ts`, `parse-track-title.ts`, `recent-songs.ts`, `sync-engine.ts` |
| Tokens | `index.css`, design spec |

No source changes made during this audit.
