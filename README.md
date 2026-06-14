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

## Deploy (Cloudflare)

```bash
npm run deploy
```

Or connect the repo to Cloudflare Pages. Static assets are configured in `wrangler.jsonc` with SPA fallback.

## Attribution

- Lyrics data from [LRCLIB](https://lrclib.net) — please respect their API usage guidelines.
- Chrome Translator API requires Chromium 138+ with built-in AI features enabled.

## License

MIT
