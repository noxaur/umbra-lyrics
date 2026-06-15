---
id: FB-power-004
title: Beta MKV export with synced lyrics
lens: power
effort: L
clientOnly: false
mvpBlocker: false
---

# Beta MKV export with synced lyrics

Export the current song as an MKV with soft subtitle tracks (native + English), Matroska chapters from lyric sections, and audio/video muxed in the browser via ffmpeg.wasm.

## Enable

Add `?beta=mkv-export` to the player URL, or opt in via the header toggle.

## Scope

- Worker resolves YouTube stream URLs via Piped API and proxies range requests
- Client serializes `LyricLine[]` to SRT and section chapters to ffmetadata
- ffmpeg.wasm muxes streams with `-c copy` (no re-encode)

## Out of scope (v1)

- ASS karaoke styling from word timestamps
- Server-side ffmpeg Container mux
- Third+ language tracks beyond native + English
