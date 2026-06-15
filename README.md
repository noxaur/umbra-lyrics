# song-kara

A client-side karaoke player: paste a YouTube URL, sing along with synced lyrics from [LRCLIB](https://lrclib.net), with optional bilingual display and theme switching.

## Features

- YouTube playback via `@bogdanrn/yt-embed`
- Synced LRC lyrics with word-level highlight; plain-lyrics fallback
- Bilingual mode (native / English / both) with Chrome Translator API fallback
- Dark-first theme with light/system modes
- Hide video (lyrics-only mode)
- Keyboard shortcuts (Space, arrows, +/-)
- Recent songs (localStorage)
- Tap lyric line to seek

## Beta: MKV export

On the player page, once lyrics load, use the **MKV Beta** button in the transport bar (bottom controls) to download an MKV with synced subtitles and section chapters.

Exports an MKV file with:

- Audio (and optional video) from YouTube
- Synced native subtitle track
- Optional English subtitle track
- Chapter markers from lyric sections (Verse, Chorus, etc.)

Processing runs in your browser via ffmpeg.wasm (~30 MB one-time download). Chromium-based browsers recommended. Export is intended for **personal use** — respect copyright and YouTube Terms of Service.

## Development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

## Test & build

```bash
npm test
npm run build
npm run preview
```

## Deploy (Cloudflare Workers)

```bash
npm run deploy
```

The app deploys as a Cloudflare Worker with static assets (`@cloudflare/vite-plugin`) and lyrics API routes on `/api/*`.

**Live URLs**

| URL | Notes |
|-----|-------|
| https://song-kara.nox-heights.workers.dev | Always works; primary fallback |
| https://song.opsec.rent | Custom domain on `opsec.rent` zone |

If `song.opsec.rent` shows "Server Not Found" in your browser, your local DNS resolver may have a stale cache. Try:

1. Use the workers.dev URL above, or
2. Set your device DNS to `1.1.1.1` / `8.8.8.8`, or
3. In Cloudflare dashboard → **opsec.rent** → **DNS**: ensure a proxied **A** record exists for `song` → `192.0.2.0` (not a Worker-type record). Delete any stale Worker record, then redeploy.

Local dev runs the Worker runtime via `vp dev` (Vite+ + Cloudflare plugin).

## Browser console noise

Some console errors are expected and safe to ignore:

- **YouTube `googlevideo.com` CORS** — the embedded player fetches video segments inside a cross-origin iframe. Browsers log CORS failures for those internal requests; playback is unaffected.
- **MyMemory / LibreTranslate proxy errors** — MyMemory often blocks Cloudflare Worker egress; LibreTranslate requires an API key (`wrangler secret put LIBRETRANSLATE_API_KEY`). The app falls back to Google Translate (and Chrome Translator when available).

Fonts are bundled via `@fontsource-variable/dm-sans` (no Google Fonts fetch). HTTP requests are redirected to HTTPS at the Worker edge.

## Attribution

- Lyrics data from [LRCLIB](https://lrclib.net) — please respect their API usage guidelines.
- Chrome Translator API requires Chromium 138+ with built-in AI features enabled.

## License

MIT
