# umbra

A client-side karaoke player: paste a YouTube or Spotify track link, sing along with synced lyrics from [LRCLIB](https://lrclib.net), with optional bilingual display and theme switching.

## Features

- YouTube playback via `@bogdanrn/yt-embed`
- Paste Spotify track links — resolves to a matching YouTube video automatically
- Optional **Log in with Spotify** in the header (OAuth; uses your account for track lookups)
- Synced LRC lyrics with word-level highlight; plain-lyrics fallback
- **Auto-transcription** when no lyrics are found — local Whisper speech-to-text in the browser
- Bilingual mode (native / English / both) with Chrome Translator API fallback
- Dark-first theme with light/system modes
- Hide video (lyrics-only mode)
- Keyboard shortcuts (Space, arrows, +/-)
- Recent songs (localStorage)
- Tap lyric line to seek

## Beta: MKV export

On the player page, once lyrics load, click **MKV Beta** in the transport bar. Export downloads audio from YouTube (via InnerTube in your browser, with a server fallback) and muxes synced subtitles plus section chapters locally with ffmpeg.wasm.
- Optional English subtitle track and video track toggle

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

**Deploy token permissions:** `CLOUDFLARE_API_TOKEN` needs **Workers Scripts:Edit** plus **Workers Routes:Edit** and **Zone:Read** on the `opsec.rent` zone so `song.opsec.rent` routes attach to the `song-kara` worker. If CI fails with a zone permission error, either widen the token or run `STRIP_ZONE_ROUTES=true npm run deploy` to deploy workers.dev only, then attach the route in the Cloudflare dashboard.

The Cloudflare Worker is still named `song-kara` (legacy) so deploys update the worker that owns `song.opsec.rent`. The app UI brands as **umbra**.

Auto-transcription downloads a quantized Whisper Base model on first use, then caches it in the browser. WebGPU is used when available, with a slower WebAssembly fallback. Desktop browsers are recommended; longer tracks may use substantial memory.

**Live URLs**

| URL | Notes |
|-----|-------|
| https://song.opsec.rent | Primary production URL |
| https://song-kara.nox-heights.workers.dev | Workers.dev fallback |

If `song.opsec.rent` shows "Server Not Found" in your browser, your local DNS resolver may have a stale cache. Try:

1. Use the workers.dev fallback above, or
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
