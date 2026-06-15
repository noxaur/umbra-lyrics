# Design Mode Session — Lyrics Player

**Started:** 2026-06-15  
**Track:** `Ktk_EDLDPeY` (天音かなた · 別世界)  
**Alt track (EN):** `dQw4w9WgXcQ`

---

## Browser

| Env | URL | Status |
|-----|-----|--------|
| **Production (open in Cursor browser)** | https://song.opsec.rent/play/Ktk_EDLDPeY | Loaded — video, header, lyrics stage, transport |
| Dev (HMR) | http://127.0.0.1:5174/play/Ktk_EDLDPeY | Running; lyrics API fails locally (shows “No lyrics found”) |
| Dev (stale) | http://127.0.0.1:5173 | Occupied by prior process; avoid until killed |

**Recommendation:** Use **production** for visual iteration when lyrics must be visible. Use **dev :5174** after `npm run dev` for HMR edits (may need cached lyrics or pasted lyrics).

**Cursor browser:** opened side panel, view ID `2b6e42`.

---

## Dev server

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

- **Active port:** `5174` (5173 was in use on restart)
- **Command:** `vp dev` (Vite+)

---

## Files map

| File | Role |
|------|------|
| `src/pages/player-page.tsx` | Page shell, split layout, lyrics column `min-w-0` |
| `src/components/lyrics-stage.tsx` | Scroll container, overflow, safe-area, line list |
| `src/components/lyric-line.tsx` | Active/inactive line styles, wrap, scale, scroll-into-view |
| `src/lib/lyric-line-visual.ts` | Active scale tokens (1.04 desktop, 1.0 mobile) |
| `src/components/now-playing-header.tsx` | Title, artist, badges, mobile truncation |
| `src/components/transport-controls.tsx` | Play, seek, ±0.5s offset, display mode |
| `src/index.css` | Global tokens, theme variables, base typography |

**Related:** `src/components/lyrics-retry.tsx` (empty/error state UI)

---

## Viewports to test

| Width | Use |
|-------|-----|
| **375px** | Mobile — lyric overflow, header wrap, transport |
| **1440px** | Desktop split — video + lyrics column |

Also spot-check **768px** (tablet) per prior UX pass.

---

## Known UX issues (from `docs/reviews/ux-ui-pass-2026-06-15.md`)

### Fixed (verify in browser)

- [x] Active lyric horizontal bleed @ 375px
- [x] `overflow-x-hidden` on lyrics stage
- [x] Long JP/EN line wrapping (`break-words`, `overflow-wrap: anywhere`)
- [x] Lyrics column `min-w-0` in lg split
- [x] Mobile header title truncation

### Deferred (design-mode candidates)

- [ ] Light-theme karaoke contrast (`visual-polish-audit.md`)
- [ ] Venue/TV font scale for ~2 m viewing
- [ ] Remove decorative `backdrop-blur` on transport
- [ ] Low-contrast inactive lyric lines on dark theme (faint grey on black)
- [ ] Production cache mismatch (JP title, EN lyric body on some loads)

---

## Iteration checklist

### Before editing

- [ ] Confirm browser URL and viewport (375 / 1440)
- [ ] Note active vs inactive lyric line contrast
- [ ] Play track briefly to verify scroll-into-view on active line

### Per change

- [ ] Edit target file; let Vite HMR reload (dev) or refresh (prod)
- [ ] `browser_snapshot` + screenshot at 375px and 1440px
- [ ] Check horizontal overflow (`xOverflow: false` on mobile)
- [ ] Check long line wrap (JP: 目配せの意味…)
- [ ] Verify transport/header don’t overlap lyrics stage

### Optional: Impeccable `live` mode

```bash
node .agents/skills/impeccable/scripts/live.mjs
# Then poll in background; browser must be on dev origin serving pageFiles
```

Requires dev server + `live` config. Use for element-pick variant generation.

### Ship criteria

- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] No regression on split layout @ lg
- [ ] `prefers-reduced-motion` respected for any new motion

---

## Impeccable setup note

`context.mjs` reports **NO_PRODUCT.md**. Run `$impeccable init` when ready to capture product/design context for variant generation.
