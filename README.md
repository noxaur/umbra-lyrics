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

## Attribution

- Lyrics data from [LRCLIB](https://lrclib.net) — please respect their API usage guidelines.
- Chrome Translator API requires Chromium 138+ with built-in AI features enabled.

## License

MIT
