# Initial Lyrics Follow Sync

## Problem

When player opens while playback is already inside song, lyric timing can identify active line but lyrics stage remains at initial scroll position. User must manually scroll near active line or press sync control before follow mode visibly works.

## Expected Behavior

- When lyrics become ready, stage centers current active lyric without user input.
- Opening player mid-song centers lyric matching current playback time.
- Startup centering remains in follow mode.
- User-initiated scrolling still changes stage to manual mode.
- Existing sync button still restores follow mode and centers active lyric.

## Cause

Initial active-index effect can run before active lyric DOM ref and final stage layout are available. Current effect makes one delayed attempt. If ref is unavailable during that attempt, centering is skipped and no later dependency guarantees another attempt.

## Design

Add bounded startup-centering behavior inside `LyricsStage`:

1. Detect a ready stage with lyrics, follow mode, and valid active index.
2. Retry on animation frames until active lyric element and scroll container exist.
3. Center active lyric immediately once refs exist.
4. Route centering through existing programmatic-scroll guard so generated scroll events cannot switch stage to manual mode.
5. Stop retrying after a small fixed frame budget or when dependencies change/unmount.

Normal active-line handoff remains unchanged. Startup logic only closes DOM/layout initialization race.

## Testing

Add component regression test that:

- renders lyrics stage with playback already at a later lyric;
- simulates active lyric ref becoming available after initial frame;
- verifies stage invokes forced centering without scroll interaction;
- verifies follow mode remains `follow`.

Run focused component tests, then full test suite and build.

## Non-Goals

- Changing lyric timing calculations.
- Changing manual-scroll re-sync thresholds.
- Changing scroll animation styling.
- Adding continuous polling after initialization.
