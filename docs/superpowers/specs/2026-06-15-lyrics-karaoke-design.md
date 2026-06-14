# Lyrics Karaoke Player — Design Spec

## Scene
Dim venue, screen glow. Dark-first theme with electric violet/magenta accent (OKLCH). Light mode available.

## Typography
- **DM Sans** for all UI and lyrics
- Active line: `clamp(1.5rem, 4vw, 3rem)`
- English subtitle: `0.75em`, muted foreground

## Color tokens (OKLCH)
| Token | Dark | Light |
|-------|------|-------|
| `--karaoke-active` | oklch(0.78 0.3 320) | oklch(0.72 0.28 320) |
| `--karaoke-muted` | oklch(0.5 0.04 280) | oklch(0.55 0.04 280) |
| `--karaoke-stage-bg` | oklch(0.1 0.025 280) | oklch(0.97 0.015 280) |

## Layout zones
1. Header — title, theme toggle, settings
2. Video panel — collapsible YouTube embed
3. Lyrics stage — centered, auto-scroll active line to middle third
4. Transport bar — play/pause, seek, offset, display mode

## Karaoke highlight
- Active line: accent color + scale(1.02)
- Word progress: inline span width interpolation (solid colors)
- Reduced motion: crossfade only, no scale

## Bilingual modes
- Native only (default for English)
- English only
- Both (native above, English below muted)
