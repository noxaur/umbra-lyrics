# Lyric Sync Perfection — Handoff from umbra chat

**Workspace:** `/home/arch/Documents/Projects/ai/umbra-lyrics` (renamed from song-kara)

**Scope agreed:** Full karaoke-ready + forced alignment (audio-based word timing via Workers AI Whisper + tab capture).

**Start here:** Execute Wave 0 (rubric + fixtures), then multi-agent waves per plan below.

## Todos

- [ ] Wave 0: sync fixtures, `reference-tracks.json`, `sync-benchmark.test.ts`, `RUBRIC.md`
- [ ] Wave 1: gap/stage state, enhanced LRC words, `/api/align` worker, DTW aligner
- [ ] Wave 2: tab audio capture, trust UX offset slider/reset, stage per-word wipe
- [ ] Wave 3: focus mode, TV mode typography
- [ ] Eval loop until rubric A–D green (max 10 waves)

## Exit rubric (summary)

- **A:** All vitest pass + sync-benchmark + word-alignment + gap-detection tests
- **B:** `/api/align` + IndexedDB cache + word wipe when aligned
- **C:** Browser checklist on 3 reference YouTube tracks
- **D:** TV mode, focus mode, WCAG contrast

## Key issues to fix

| ID | Issue |
|----|-------|
| S1 | Long instrumental → slow wipe (cap `endMs` / gap placeholder) |
| S2 | Pre-lyrics intro blank (intro cue) |
| S3 | Offset persists across songs |
| S4 | Cryptic offset controls |
| S5 | Unsynced lines still wipe |
| S6 | No word-level timestamps |
| S7 | Venue unreadable at 2m |
| S8 | No focus/TV mode |

Full plan with architecture diagrams: see Cursor plan `lyric_sync_perfection_ce4c47a7.plan.md` or expand this doc in Agent mode.
