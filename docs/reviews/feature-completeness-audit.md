# Feature Completeness Audit — umbra

**Date:** 2026-06-15  
**Compared against:** `docs/superpowers/plans/2026-06-15-lyrics-karaoke-player.md`, `docs/superpowers/backlog/approved.md`  
**Scope reviewed:** `src/`, `tests/`, `README.md`, `wrangler.jsonc`, `package.json`

---

## Executive summary

The **MVP karaoke loop is largely complete**: paste URL → `/play/:videoId` → YouTube embed → LRCLIB lyrics → synced/unsynced display → transport controls → bilingual modes → hide video → theme switching. All **3 approved v1 bonus features** are present with minor polish gaps.

Main gaps vs plan: **lucide-animated** (substituted with Motion + lucide-react), **reduced-motion** incomplete, **header settings** missing, **virtualized lyrics** not implemented, **YouTube player errors** not surfaced, possible **Translator API language-code bug**, and **Task 14 audit** not evidenced.

---

## Feature matrix

| Feature / Task | Status | Evidence | User-visible gap |
|---|---|---|---|
| **Task 0: Vite + React + TS scaffold** | **Full** | `package.json`, `vite.config.ts`, `src/main.tsx` | — |
| **Task 0: Tailwind v4 + shadcn** | **Full** | `src/index.css`, `components.json`, `src/components/ui/*` | — |
| **Task 0: Vitest + Testing Library** | **Partial** | `vitest.config` in `vite.config.ts`, `tests/setup.ts` | Testing Library installed but **no component tests** |
| **Task 0: wrangler.jsonc + deploy script** | **Partial** | `wrangler.jsonc`, `package.json` `deploy` | `wrangler` **not in devDependencies** — `npm run deploy` may fail without global CLI |
| **Task 1: YouTube URL parser** | **Full** | `src/lib/youtube-url.ts`, `tests/lib/youtube-url.test.ts` | — |
| **Task 1: Zod validation** | **Missing** | `zod` in deps; parser is regex-only | No runtime schema validation (plan mentioned Zod) |
| **Task 2: YouTube player hook** | **Full** | `src/hooks/use-youtube-player.ts` | — |
| **Task 2: types/player.ts** | **Missing** | Types inline in hook | No dedicated player types file (minor) |
| **Task 2: YouTube error surfacing** | **Missing** | `error` returned but unused in `player-page.tsx` | Invalid/private videos → blank panel, no message |
| **Task 3: Track title parser** | **Full** (+) | `src/lib/parse-track-title.ts`, `tests/lib/parse-track-title.test.ts` | Exceeds plan (JP titles, feat/remix stripping) |
| **Task 4: LRC parser + types** | **Full** | `src/lib/lrc-parser.ts`, `src/types/lyrics.ts`, `tests/lib/lrc-parser.test.ts` | — |
| **Task 5: LRCLIB lyrics service** | **Full** (+) | `src/lib/lyrics-service.ts`, `tests/lib/lyrics-service.test.ts` | Multi-strategy search beyond plan |
| **Task 6: Sync engine** | **Full** | `src/lib/sync-engine.ts`, `tests/lib/sync-engine.test.ts` | — |
| **Task 7: Design tokens + spec** | **Full** | `src/index.css`, `docs/superpowers/specs/2026-06-15-lyrics-karaoke-design.md` | — |
| **Task 8: Theme provider + toggle** | **Full** | `src/components/theme-provider.tsx`, `mode-toggle.tsx` | Light/dark/system + `umbra-theme` persistence |
| **Task 9: lucide-animated icons** | **Partial** | `src/components/icons/animated-icon.tsx` | Plan requires lucide-animated.com via shadcn CLI; app uses **Motion-wrapped lucide-react** |
| **Task 10: Lyrics stage** | **Partial** | `src/components/lyrics-stage.tsx`, `lyric-line.tsx` | No virtualization; loading skeleton present |
| **Task 10: Auto-scroll active line** | **Full** | `lyrics-stage.tsx` `scrollIntoView({ block: "center" })` | — |
| **Task 10: Empty/loading/error states** | **Full** | `lyrics-stage.tsx`, `lyrics-retry.tsx` | Editable artist/track retry on error |
| **Task 11: Transport controls** | **Full** | `src/components/transport-controls.tsx` | Play/pause, seek, ±0.5s offset, display mode |
| **Task 11: Hide video toggle** | **Full** | `youtube-panel.tsx`, `player-store.ts` | Collapses to `h-0`; audio continues (iframe not paused) |
| **Task 11: videoHidden persistence** | **Full** | `player-store.ts` `umbra-video-hidden` | — |
| **Task 12: Language detection (franc)** | **Full** | `src/lib/language-service.ts` | — |
| **Task 12: LRCLIB English search** | **Full** | `lyrics-service.ts` `searchEnglishLyrics` | — |
| **Task 12: Chrome Translator fallback** | **Partial** | `src/hooks/use-translation.ts`, `player-page.tsx` | Button when available; **no notice when unavailable**; franc ISO 639-3 (`jpn`) may not match Translator BCP-47 (`ja`) |
| **Task 12: Line-count mismatch warning** | **Full** | `player-page.tsx` | Amber warning when counts differ |
| **Task 12: Bilingual display modes** | **Partial** | `lyric-line.tsx`, `transport-controls.tsx` | Native/English/Both work; **English-only has no word sweep** |
| **Task 13: Home URL input + routing** | **Full** | `url-input.tsx`, `home-page.tsx`, `App.tsx` | Paste auto-navigates |
| **Task 13: Player page integration** | **Full** | `player-page.tsx` | Full load flow wired |
| **Task 13: useLyricsSync rAF loop** | **Full** | `src/hooks/use-lyrics-sync.ts` | — |
| **Task 13: Responsive layout** | **Full** | `player-page.tsx` `lg:flex-row` | Desktop side-by-side; mobile stacked |
| **Task 13: Zustand player store** | **Full** | `src/stores/player-store.ts` | — |
| **Task 14: Frontend audit** | **Missing** | No audit commit/docs | Scale on reduced-motion; shortcut guard gaps; no live region |
| **Task 15: README + deploy docs** | **Full** | `README.md` | LRCLIB + Translator attribution present |
| **Task 15: Deploy verified** | **Unknown** | Config only | No evidence of successful `wrangler deploy` |
| **Unsynced fallback + banner** | **Full** | `lrc-parser.ts`, `lyrics-stage.tsx` | "No synced lyrics — approximate timing" |
| **Word-level highlight** | **Partial** | `lyric-line.tsx` | Width-overlay sweep (matches design spec); native only |
| **Reduced motion** | **Partial** | `MotionConfig reducedMotion="user"` in `lyric-line.tsx` | Active line still `scale-[1.02]`; `AnimatedIcon` hover scale/rotate |
| **Header: title + theme** | **Full** | `app-shell.tsx`, `mode-toggle.tsx` | — |
| **Header: settings** | **Missing** | `app-shell.tsx` | Plan/design spec list settings; not implemented |
| **DM Sans typography** | **Full** | `index.html`, `index.css` `--font-sans` | — |
| **Dark-first OKLCH theme** | **Full** | `src/index.css` | — |
| **Client-only architecture** | **Full** | No backend; LRCLIB + yt-embed in browser | — |
| **FB-ux-001: Keyboard shortcuts** | **Partial** | `use-keyboard-shortcuts.ts`, `shortcuts-help.tsx` | Space/arrows/+/- work; help via **icon** not `?` key; `<select>` not excluded |
| **FB-karaoke-001: Tap line to seek** | **Full** | `lyric-line.tsx`, `lyrics-stage.tsx` | Click + button Enter; offset-aware seek |
| **FB-power-001: Recent songs** | **Full** | `recent-songs.ts`, `home-page.tsx` | Last 10, clear, link to `/play/:id` |

---

## Bonus feature polish review

### FB-ux-001 — Keyboard shortcuts
| Criterion | Status |
|---|---|
| Shortcuts outside text inputs | **Full** — guards `INPUT`, `TEXTAREA`, `contentEditable` |
| Listed in help popover | **Partial** — `ShortcutsHelp` dropdown; proposal asked for `?` key |
| No URL field conflict | **Full** — shortcuts only on `PlayerPage` |
| Polish gaps | `+`/`-` work while `<select>` focused; no `?` shortcut to open help |

### FB-karaoke-001 — Tap line to seek
| Criterion | Status |
|---|---|
| Click inactive line seeks | **Full** |
| Synced + unsynced | **Full** |
| Keyboard Enter on focused line | **Full** — `motion.button` |
| Polish gaps | No visual "seeking" feedback; long songs may lag without virtualization |

### FB-power-001 — Recent songs
| Criterion | Status |
|---|---|
| List on home when history exists | **Full** |
| Click → `/play/:videoId` | **Full** |
| Clear history | **Full** |
| Polish gaps | No thumbnail/duration; title falls back to `videoId`; list only refreshes on remount |

---

## Top 10 missing / partial items (by severity)

| # | Item | Severity | Status | Impact |
|---|---|---|---|---|
| 1 | **YouTube embed errors not shown** | **High** | Missing | Bad/private IDs → silent failure |
| 2 | **Translator language code mismatch** (`franc` 3-letter vs BCP-47) | **High** | Likely broken | "Translate to English" may never appear or fail silently |
| 3 | **lucide-animated icons** (plan requirement) | **Medium** | Partial | Motion hover on static lucide, not lucide-animated strokes |
| 4 | **Reduced-motion compliance** | **Medium** | Partial | Scale/rotate remain despite `prefers-reduced-motion` |
| 5 | **Translator unavailable notice** | **Medium** | Missing | Non-English songs with no LRCLIB English → no explanation |
| 6 | **Task 14 frontend audit** | **Medium** | Missing | Touch targets partly OK; a11y polish incomplete |
| 7 | **Virtualized lyrics scroll** (Task 10) | **Medium** | Missing | Long songs may jank on low-end devices |
| 8 | **No UI/integration tests** | **Medium** | Partial | Plan expects Browser MCP + Testing Library; only lib unit tests |
| 9 | **Header settings zone** | **Low** | Missing | No settings surface (offset persistence, font size, etc.) |
| 10 | **FB-ux-001 `?` help + select focus guard** | **Low** | Partial | Help discoverability; accidental offset changes in display dropdown |

---

## Test coverage summary

| Area | Files | Status |
|---|---|---|
| YouTube URL | `tests/lib/youtube-url.test.ts` | Full |
| LRC parser | `tests/lib/lrc-parser.test.ts` | Full |
| Track title | `tests/lib/parse-track-title.test.ts` | Full (extended) |
| Sync engine | `tests/lib/sync-engine.test.ts` | Full |
| Lyrics service | `tests/lib/lyrics-service.test.ts` | Full (extended) |
| Hooks (keyboard, translation, sync) | — | **Missing** |
| Components / pages | — | **Missing** |
| Bonus features | — | **Missing** |

---

## Recommendations (priority order)

1. Surface `useYouTubePlayer().error` on player page with retry/home link.
2. Map `franc` codes → BCP-47 before `Translator.create`; show notice when translation unavailable.
3. Add `motion-reduce:` overrides for scale/rotate on lyrics + icons.
4. Either install lucide-animated per Task 9 or update plan/spec to accept Motion wrapper.
5. Add `wrangler` to devDependencies; verify `npm run build && npm run deploy`.
6. Run Task 14 impeccable audit (contrast, focus, mobile, reduced-motion screenshots).
7. Exclude `<select>` from keyboard shortcut handler; optional `?` to open shortcuts help.

---

## File inventory (implemented vs planned)

**Present:** All core `src/lib/*`, hooks, stores, pages, components from plan except dedicated `types/player.ts` and real lucide-animated assets.

**Not present:** `docs/reviews/`, component tests, settings UI, virtualization, audit artifacts.
