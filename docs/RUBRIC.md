# Lyric Sync Rubric

## A — Automated tests

- `npm test` passes
- `sync-benchmark.test.ts` passes for all reference tracks
- `plain-lyrics-timing`, `gap-detection`, `lrc-sync-calibration`, and `word-alignment` tests pass

## B — Synced LRC quality

- Long instrumental gaps do not keep a lyric line wiping for the entire gap
- Enhanced LRC word tags survive HTML cleaning and end at the parent line window
- LRC timestamps are scaled when the master track is longer than the YouTube duration

## C — Auto-timed plain lyrics

- Paragraph breaks reserve pause time between verses
- Repeated chorus lines share the same per-line duration
- The final vocal lines are normalized to the track outro window

## D — Runtime behavior

- Short inter-line pauses hold the previous lyric instead of dropping to idle
- Line-level synced lyrics snap highlight instead of faking a word wipe
- Cached lyrics are re-parsed when the YouTube duration is known

## Manual browser checklist

1. `/play/fJ9rUzIMcZQ` — synced lines advance without long stuck wipes
2. `/play/Ktk_EDLDPeY` — auto-timed Japanese lyrics stay roughly with the vocal
3. `/play/kXYiU_JCYtU` — short pauses keep the previous line highlighted
